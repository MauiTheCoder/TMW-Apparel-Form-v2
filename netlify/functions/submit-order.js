// netlify/functions/submit-order.js - With Google Sheets integration
const sgMail = require("@sendgrid/mail");
const { google } = require("googleapis");

// Configure SendGrid
console.log("SENDGRID_API_KEY exists:", !!process.env.SENDGRID_API_KEY);
console.log("SENDGRID_API_KEY starts with SG:", process.env.SENDGRID_API_KEY?.startsWith('SG.'));
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  console.error("SENDGRID_API_KEY environment variable is not set!");
}

// Configure Google Sheets
const sheets = google.sheets("v4");

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // Handle OPTIONS request
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    console.log("Processing order submission...");

    // Parse form data
    const formData = JSON.parse(event.body);
    console.log("Form data received:", formData);

    // Validate required fields
    const requiredFields = [
      "kaimahiName",
      "employeeNumber",
      "campus",
      "email",
      "items",
      "total",
      "paymentType",
    ];
    for (const field of requiredFields) {
      if (!formData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Parse items if it's a string
    let items = formData.items;
    if (typeof items === "string") {
      items = JSON.parse(items);
    }

    // Generate order data
    const orderData = {
      orderNumber: formData.orderNumber || `TMW-${Date.now()}`,
      kaimahiName: formData.kaimahiName,
      employeeNumber: formData.employeeNumber,
      campus: formData.campus,
      email: formData.email,
      items: items,
      total: parseFloat(formData.total),
      paymentType: formData.paymentType,
      paymentDate: formData.paymentDate || "N/A",
      timestamp: new Date().toISOString(),
      orderDate: new Date().toLocaleDateString("en-NZ"),
    };

    console.log("Processed order data:", orderData);

    // Send email (PDF generation temporarily disabled)
    console.log("Sending confirmation email...");
    await sendConfirmationEmail(orderData, null);
    console.log("Email sent successfully");

    // Update Google Sheets
    console.log("Updating spreadsheet...");
    await updateSpreadsheet(orderData);
    console.log("Spreadsheet updated successfully");

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: "Order processed successfully",
        orderNumber: orderData.orderNumber,
      }),
    };
  } catch (error) {
    console.error("Error processing order:", error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        details:
          process.env.NODE_ENV === "development" ? error.stack : undefined,
      }),
    };
  }
};

async function sendConfirmationEmail(orderData, pdfBuffer) {
  // Create payment schedule text
  let paymentSchedule = "";
  if (orderData.paymentType === "plan") {
    const thirdAmount = (orderData.total / 3).toFixed(2);
    const remainderAmount = (orderData.total - thirdAmount * 2).toFixed(2);
    paymentSchedule = `
      <h3>Payment Plan Schedule:</h3>
      <ul>
        <li><strong>Payment 1:</strong> 13/08/2025 - $${thirdAmount} (33%)</li>
        <li><strong>Payment 2:</strong> 27/08/2025 - $${thirdAmount} (33%)</li>
        <li><strong>Payment 3:</strong> 10/09/2025 - $${remainderAmount} (34%)</li>
      </ul>
    `;
  } else if (orderData.paymentDate && orderData.paymentDate !== "N/A") {
    paymentSchedule = `
      <h3>Payment Details:</h3>
      <p><strong>Payment Date:</strong> ${orderData.paymentDate}</p>
      <p><strong>Amount:</strong> $${orderData.total.toFixed(2)} (Payment in Full)</p>
    `;
  }

  // Create items list for email
  const itemsList = orderData.items
    .map(
      (item) =>
        `<li>${item.name} (Size: ${item.size}, Quantity: ${item.quantity}) - $${(item.price * item.quantity).toFixed(2)}</li>`,
    )
    .join("");

  const emailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">Kia ora ${orderData.kaimahiName}!</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">Your Te Mata Wānanga apparel order has been confirmed</p>
      </div>

      <div style="padding: 2rem; border: 1px solid #ddd; border-top: none; border-radius: 0 0 10px 10px;">
        <div style="background: #f8f9fa; padding: 1rem; border-radius: 8px; margin-bottom: 2rem;">
          <h2 style="color: #667eea; margin-top: 0;">Order Details</h2>
          <p><strong>Order Number:</strong> ${orderData.orderNumber}</p>
          <p><strong>Order Date:</strong> ${orderData.orderDate}</p>
          <p><strong>Employee Number:</strong> ${orderData.employeeNumber}</p>
          <p><strong>Campus:</strong> ${orderData.campus}</p>
        </div>

        <h3 style="color: #667eea;">Items Ordered:</h3>
        <ul style="background: #f8f9fa; padding: 1rem; border-radius: 8px;">
          ${itemsList}
        </ul>

        <div style="background: #e8f5e8; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
          <p style="margin: 0; font-size: 18px;"><strong>Total: $${orderData.total.toFixed(2)}</strong></p>
        </div>

        ${paymentSchedule}

        <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 1rem; border-radius: 8px; margin: 2rem 0;">
          <h3 style="color: #856404; margin-top: 0;">⚠️ Important - Next Steps:</h3>
          ${pdfBuffer ? `
          <ol style="margin: 0; padding-left: 20px;">
            <li><strong>Print</strong> the attached salary deduction form</li>
            <li><strong>Sign</strong> the form where indicated</li>
            <li><strong>Email</strong> the signed form to: <a href="mailto:payroll@twoa.ac.nz" style="color: #667eea;">payroll@twoa.ac.nz</a></li>
          </ol>
          <p style="margin: 1rem 0 0 0; font-size: 14px; color: #856404;">
            <strong>Note:</strong> Your order will not be processed until the signed salary deduction form is received by payroll.
          </p>
          ` : `
          <ol style="margin: 0; padding-left: 20px;">
            <li><strong>Contact payroll</strong> to arrange salary deduction</li>
            <li><strong>Email:</strong> <a href="mailto:payroll@twoa.ac.nz" style="color: #667eea;">payroll@twoa.ac.nz</a></li>
            <li><strong>Include</strong> your order number: ${orderData.orderNumber}</li>
          </ol>
          <p style="margin: 1rem 0 0 0; font-size: 14px; color: #856404;">
            <strong>Note:</strong> Download your Salary DeductionForm here: https://drive.google.com/file/d/1PdSds0dDj3yIPyCGc0XhgTItvxSsyunv/view?usp=sharing. Please contact leon.green@twoa.ac.nz directly if the PDF form is unavailable.
          </p>
          `}
        </div>

        <div style="text-align: center; margin-top: 2rem; padding: 1rem; background: #f8f9fa; border-radius: 8px;">
          <p style="margin: 0; color: #666;">
            If you have any questions about your order, please contact us at 
            <a href="mailto:orders@twoa.ac.nz" style="color: #667eea;">orders@twoa.ac.nz</a>
          </p>
        </div>
      </div>
    </div>
  `;

  const msg = {
    to: orderData.email,
    from: {
      email: process.env.FROM_EMAIL || "leon.green@twoa.ac.nz",
      name: "Te Mata Wānanga - Apakura",
    },
    subject: `Order Confirmation - ${orderData.orderNumber} - Te Mata Wānanga Apparel`,
    html: emailContent,
  };

  // Add PDF attachment if generation was successful
  if (pdfBuffer) {
    msg.attachments = [
      {
        content: pdfBuffer.toString("base64"),
        filename: `Salary_Deduction_Form_${orderData.orderNumber}.pdf`,
        type: "application/pdf",
        disposition: "attachment",
      },
    ];
  }

  await sgMail.send(msg);
}

async function updateSpreadsheet(orderData) {
  try {
    // Set up Google Sheets authentication
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const authClient = await auth.getClient();
    google.options({ auth: authClient });

    // Prepare data row
    const itemsText = orderData.items
      .map((item) => `${item.name} (${item.size}) x${item.quantity}`)
      .join(", ");

    const row = [
      orderData.orderNumber,
      orderData.timestamp,
      orderData.orderDate,
      orderData.kaimahiName,
      orderData.employeeNumber,
      orderData.campus,
      orderData.email,
      itemsText,
      orderData.total.toFixed(2),
      orderData.paymentType,
      orderData.paymentDate,
      "Pending", // Status
      "", // Notes
    ];

    // Append to spreadsheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: "1BPVSMx4ARWJqDcRXf0OQ52u3Ij8AhuKPDTaNLQokiRs",
      range: "Sheet1!A:M", // Adjust range as needed
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [row],
      },
    });

    console.log("Successfully added order to spreadsheet");
  } catch (error) {
    console.error("Error updating spreadsheet:", error);
    // Don't throw error - we don't want to fail the entire process if spreadsheet update fails
  }
}

// PDF generation functions temporarily removed for Railway deployment stability