// netlify/functions/submit-order.js
const { google } = require("googleapis");
const sgMail = require("@sendgrid/mail");
const puppeteer = require("puppeteer");

// Configure SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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

    // Step 1: Generate PDF
    console.log("Generating PDF...");
    const pdfBuffer = await generatePayrollPDF(orderData);
    console.log("PDF generated successfully");

    // Step 2: Send email with PDF attachment
    console.log("Sending confirmation email...");
    await sendConfirmationEmail(orderData, pdfBuffer);
    console.log("Email sent successfully");

    // Step 3: Update Google Sheets
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

async function generatePayrollPDF(orderData) {
  let browser = null;

  try {
    // Launch browser (Replit version - no chrome-aws-lambda needed)
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // Generate HTML for PDF
    const htmlContent = generatePayrollHTML(orderData);

    // Set content and generate PDF
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "15mm",
        bottom: "20mm",
        left: "15mm",
      },
    });

    return pdfBuffer;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

function generatePayrollHTML(orderData) {
  // Calculate payment date text
  let paymentDateText = "";
  if (orderData.paymentType === "plan") {
    paymentDateText = "13/08/2025 (First Payment - 3 installments)";
  } else if (orderData.paymentDate && orderData.paymentDate !== "N/A") {
    paymentDateText = `${orderData.paymentDate} (Payment in Full)`;
  } else {
    paymentDateText = "To be determined";
  }

  // Generate items table rows
  const itemsRows = orderData.items
    .map((item) => {
      // Map item names to formal descriptions
      let description = "";
      if (item.name === "T-Shirt") {
        description = "Apakura - Te Mata Wānanga T-Shirt";
      } else if (item.name === "Crewneck") {
        description = "Apakura - Te Mata Wānanga Crew Jersey";
      } else {
        description = `Apakura - Te Mata Wānanga ${item.name}`;
      }

      return `
      <tr>
        <td><em>${description}</em></td>
        <td>${item.size}</td>
        <td>${item.quantity}</td>
        <td>${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Salary Deduction Form - Te Mata Wānanga</title>
      <style>
        body {
          font-family: 'Times New Roman', serif;
          margin: 0;
          padding: 20px;
          color: #333;
          line-height: 1.4;
          font-size: 12pt;
        }

        .form-container {
          max-width: 800px;
          margin: 0 auto;
        }

        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #333;
          padding-bottom: 20px;
        }

        .header h1 {
          font-size: 16pt;
          font-weight: bold;
          margin: 0;
          line-height: 1.2;
        }

        .notice {
          background: #f8f9fa;
          border: 2px solid #333;
          padding: 15px;
          margin: 30px 0;
          text-align: center;
        }

        .details {
          margin: 30px 0;
        }

        .detail-row {
          display: flex;
          gap: 40px;
          margin-bottom: 20px;
          border-bottom: 1px solid #ddd;
          padding-bottom: 10px;
        }

        .detail-item {
          flex: 1;
        }

        .detail-item.full-width {
          flex: 100%;
        }

        .detail-item strong {
          display: block;
          font-weight: bold;
          margin-bottom: 5px;
        }

        .detail-value {
          border-bottom: 1px solid #333;
          min-height: 25px;
          padding: 5px 0;
        }

        .items-table {
          margin: 40px 0;
        }

        .items-table table {
          width: 100%;
          border-collapse: collapse;
          border: 2px solid #333;
        }

        .items-table th,
        .items-table td {
          border: 1px solid #333;
          padding: 12px;
          text-align: left;
        }

        .items-table th {
          background: #f8f9fa;
          font-weight: bold;
        }

        .total-row {
          background: #f8f9fa;
          font-weight: bold;
        }

        .payment-section {
          margin: 40px 0;
          border: 1px solid #333;
          padding: 20px;
        }

        .payment-section strong {
          display: block;
          margin-bottom: 10px;
        }

        .payment-value {
          border-bottom: 1px solid #333;
          min-height: 25px;
          padding: 5px 0;
        }

        .signature-section {
          margin-top: 60px;
        }

        .signature-row {
          display: flex;
          gap: 40px;
          align-items: flex-end;
        }

        .signature-item {
          flex: 1;
        }

        .signature-item strong {
          display: block;
          margin-bottom: 10px;
        }

        .signature-line {
          border-bottom: 1px solid #333;
          height: 40px;
        }

        .signature-line.short {
          max-width: 200px;
        }

        @media print {
          .form-container {
            max-width: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="form-container">
        <div class="header">
          <h1>APAKURA TE MATA<br>WĀNANGA KĀKAHU<br>SALARY/WAGE DEDUCTION<br>FORM</h1>
        </div>

        <div class="notice">
          <p><strong><em>Please ensure you have filled the online form to order your kākahu and that this form is sent to payroll@twoa.ac.nz</em></strong></p>
        </div>

        <div class="details">
          <div class="detail-row">
            <div class="detail-item">
              <strong>Kaimahi Name</strong>
              <div class="detail-value">${orderData.kaimahiName}</div>
            </div>
            <div class="detail-item">
              <strong>Employee #</strong>
              <div class="detail-value">${orderData.employeeNumber}</div>
            </div>
          </div>

          <div class="detail-row">
            <div class="detail-item full-width">
              <strong>Campus</strong>
              <div class="detail-value">${orderData.campus}</div>
            </div>
          </div>
        </div>

        <div class="items-table">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Size</th>
                <th>Quantity</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="3"><strong>Overall Total</strong></td>
                <td><strong>${orderData.total.toFixed(2)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div class="payment-section">
          <strong>Date to commence payments</strong>
          <div class="payment-value">${paymentDateText}</div>
        </div>

        <div class="signature-section">
          <div class="signature-row">
            <div class="signature-item">
              <strong>Kaimahi signature</strong>
              <div class="signature-line"></div>
            </div>
            <div class="signature-item">
              <strong>Date</strong>
              <div class="signature-line short"></div>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

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
          <ol style="margin: 0; padding-left: 20px;">
            <li><strong>Print</strong> the attached salary deduction form</li>
            <li><strong>Sign</strong> the form where indicated</li>
            <li><strong>Email</strong> the signed form to: <a href="mailto:payroll@twoa.ac.nz" style="color: #667eea;">payroll@twoa.ac.nz</a></li>
          </ol>
          <p style="margin: 1rem 0 0 0; font-size: 14px; color: #856404;">
            <strong>Note:</strong> Your order will not be processed until the signed salary deduction form is received by payroll.
          </p>
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
      email: process.env.FROM_EMAIL || "orders@twoa.ac.nz",
      name: "Te Mata Wānanga - Apakura",
    },
    subject: `Order Confirmation - ${orderData.orderNumber} - Te Mata Wānanga Apparel`,
    html: emailContent,
    attachments: [
      {
        content: pdfBuffer.toString("base64"),
        filename: `Salary_Deduction_Form_${orderData.orderNumber}.pdf`,
        type: "application/pdf",
        disposition: "attachment",
      },
    ],
  };

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
      "", // Payroll Received
      "", // Order Fulfilled
    ];

    // Append to spreadsheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: "Orders!A:O", // Adjust range as needed
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
