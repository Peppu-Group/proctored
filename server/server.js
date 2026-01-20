// server.js
require('dotenv').config(); // <-- Add this at the top
const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
const { google } = require('googleapis');
const axios = require('axios');
const tokenManager = require('./tokenManager');
const cookieParser = require('cookie-parser');
const qs = require('querystring');
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const { GoogleGenAI } = require("@google/genai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(cors());
app.use(cookieParser());
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
} = process.env;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const SECRET_KEY = process.env.SECRET_KEY;
const serviceAccountEmail = 'proctor-peppubuild@proctor-peppubuild.iam.gserviceaccount.com'; // Replace with your service account email

const transporter = nodemailer.createTransport({
    host: process.env.HOST,
    port: 465, // Use 587 for TLS/STARTTLS
    secure: true, // true for port 465 (SSL), false for port 587 (TLS)
    auth: {
        user: 'users@peppubuild.com', // Your Namecheap Private Email address
        pass: process.env.PASSWORD // Your email account password
    }
});

// Your Meta Verify Token
const VERIFY_TOKEN = "ugochi";

// Define paths
const logFile = path.join(process.cwd(), "webhook.log");
const statusDB = path.join(process.cwd(), "status.json");

// ✅ Utility: Append log message to file
async function logToFile(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;

  try {
    await fs.appendFile(logFile, logLine);
  } catch (err) {
    console.error("Error writing log:", err);
  }
}

// ✅ GET route to return log content
app.get("/logs", async (req, res) => {
  try {
    const content = await fs.readFile(logFile, "utf-8");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200).send(content);
  } catch (err) {
    console.error("Error reading log file:", err);
    res.status(500).send("Error reading log file");
  }
});

// ✅ 1. VERIFY WEBHOOK (GET)
app.get("/webhook", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      await logToFile("✅ Webhook verified successfully!");
      res.status(200).send(challenge);
    } else {
      await logToFile("❌ Webhook verification failed: invalid token");
      res.sendStatus(403);
    }
  } else {
    await logToFile("⚠️ Webhook verification failed: missing parameters");
    res.sendStatus(400);
  }
});

// ✅ 2. HANDLE MESSAGES AND STATUS UPDATES (POST)
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object) {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        const value = change.value;

        // 📩 Handle status updates (sent, delivered, read, failed)
        if (value.statuses) {
          const status = value.statuses[0];
          const logLine = `📩 Message ${status.id} to ${status.recipient_id} is now ${status.status}`;
          await logToFile(logLine);

          try {
            let db = {};
            try {
              const existing = await fs.readFile(statusDB, "utf8");
              db = JSON.parse(existing);
            } catch (err) {
              // Ignore if file doesn't exist yet
            }

            db[status.id] = {
              status: status.status,
              recipient: status.recipient_id,
              timestamp: status.timestamp,
            };

            await fs.writeFile(statusDB, JSON.stringify(db, null, 2));
          } catch (err) {
            console.error("Error updating status DB:", err);
          }
        }

        // 💬 Handle incoming messages
        if (value.messages) {
          const message = value.messages[0];
          await logToFile(
            `💬 New message from ${message.from}: ${message.text?.body || "(no text)"}`
          );
        }
      }
    }

    res.sendStatus(200);
  } else {
    await logToFile("⚠️ Webhook received request with no body.object");
    res.sendStatus(404);
  }
});

// ✅ 3. CHECK MESSAGE STATUS (GET)
app.get("/status/:id", async (req, res) => {
  const id = req.params.id;

  try {
    const data = await fs.readFile(statusDB, "utf8");
    const db = JSON.parse(data);
    res.json({
      id,
      status: db[id]?.status || "unknown",
      recipient: db[id]?.recipient || null,
      timestamp: db[id]?.timestamp || null,
    });
  } catch (err) {
    res.json({ id, status: "unknown" });
  }
});

app.post('/promptai', async (req, res) => {
    let userReq = req.body.userReq;
    // let userReq = "I want a portfolio website's home page"
    try {
        const genAI = new GoogleGenerativeAI(process.env.AI_TOKEN); // Make sure you have GOOGLE_API_KEY environment variable set
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `
      Generate a detailed marine maintenance to-do list, covering tasks for ${userReq} maintenance. 
      Include checks, inspections, cleaning, repairs, and replacements. 
      Organize it for a typical small to medium-sized vessel. 
      Format the output as an array, where each item in the list is a dictionary with the keys 'id', 'text', 'completed: false'. 
      Do not include any code explanation before or after the for loop. 
      The response should only contain the loop as a text, without code inscriptions, just tasks.
      `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();


        res.send({ result: responseText });

    } catch (error) {
        console.error("Error generating content:", error);
        res.status(500).send("An error occurred while generating the content.");
    }
});

/**
  * This function authenticates the user for their Google Drive account.
  * @param {string} accessToken - Oauth Access Token
 */
function driveAuth(accessToken) {
    const auth = new OAuth2Client({});
    auth.setCredentials({ access_token: accessToken })
    const service = google.drive({ version: 'v3', auth: auth });
    return service;
}

// Initialize the authenticated Sheets and Drive API clients
function getSheetsAndDrive() {
    // Load Google service account credentials
    const credentials = require(path.join(__dirname, 'service-account.json'));

    const SCOPES = ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file'];

    // Authenticate using service account
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: SCOPES,
    });

    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    return { sheets, drive };
}


app.post('/tokenize', (req, res) => {
    const { formId, formName, timeLimit } = req.body;

    const token = jwt.sign(
        { formId, formName, timeLimit },
        SECRET_KEY,
        { expiresIn: '10m' }
    );

    res.json({ token });
});

app.post('/verify-token', (req, res) => {
    const { token } = req.body;

    try {
        const payload = jwt.verify(token, process.env.SECRET_KEY);
        // Only send trusted values to client
        const { formId, formName, timeLimit, email, useremail } = payload;

        res.json({ valid: true, formId, formName, timeLimit, email, useremail });
    } catch (err) {
        res.status(401).json({ valid: false, message: 'Invalid or expired token' });
    }
});

app.post('/check-status', async (req, res) => {
    const { email, sheet } = req.body;

    try {
        const result = await checkEmailStatus(email, sheet);
        res.json(result);
    } catch (error) {
        console.error('Error checking email status:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});


async function checkEmailStatus(email, sheet) {
    const { sheets, drive } = getSheetsAndDrive();

    // Step 1: Find the spreadsheet by name
    const fileList = await drive.files.list({
        q: `name='${sheet}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed = false`,
        fields: 'files(id, name)',
    });

    if (fileList.data.files.length === 0) {
        throw new Error(`Spreadsheet named "${sheet}" not found.`);
    }

    const spreadsheetId = fileList.data.files[0].id;

    // Step 2: Get columns A to C to check email and status
    const range = 'Sheet1!A:C';
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
    });

    const rows = response.data.values || [];

    // Step 3: Search for the email and return the status
    for (let row of rows) {
        if (row[0] === email) {
            const status = row[2] || 'Unknown';
            return { success: true, status };
        }
    }

    return { success: false, message: 'Email not found in sheet.' };
}


// get all StudentScore after exam, then get the email and matching score.
app.get('/get-quiz-scores/:formId/:accessToken', async (req, res) => {
    const { formId, accessToken } = req.params;

    const auth = new OAuth2Client();
    auth.setCredentials({ access_token: accessToken });

    try {
        const forms = google.forms({ version: 'v1', auth });

        const response = await forms.forms.responses.list({
            formId: formId,
        });

        const responses = response.data.responses || [];

        const result = responses.map(resp => {
            let email = 'Unavailable';
            let score = 'Unavailable';

            // Find email inside answers
            if (resp.answers) {
                for (const questionId in resp.answers) {
                    const answer = resp.answers[questionId];
                    const textAnswers = answer?.textAnswers?.answers || [];

                    for (const singleAnswer of textAnswers) {
                        if (validateEmail(singleAnswer.value)) {
                            email = singleAnswer.value;
                            break;
                        }
                    }
                    if (email !== 'Unavailable') break; // Stop after finding the email
                }
            }

            // Find score (correct key is 'grade', not 'grading')
            if (resp.grade) {
                score = resp.grade.score ?? 'Unavailable';
            }

            return { email, score };
        });

        res.json(result);

    } catch (error) {
        console.error('Error fetching form scores:', error.message);
        res.status(500).json({ error: 'Failed to retrieve quiz scores' });
    }
});

// Helper function to validate email
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

app.post('/update-sheet', async (req, res) => {
    const { sheet: sheetName, email, violations } = req.body;
    try {
        const result = await updateStatusToFinished(email, sheetName, violations);
        if (result.success) {
            res.status(200).json({ valid: true, row: result.row });
        } else {
            res.status(400).json({ valid: false, message: result.message });
        }
    } catch (error) {
        console.error('Error writing to sheet:', error);
        res.status(500).json({ valid: false, message: `Can't write into Sheet` });
    }
});

async function updateStatusToFinished(email, sheet, violations) {
    const { sheets, drive } = getSheetsAndDrive();

    // Step 1: Find the spreadsheet by name
    const fileList = await drive.files.list({
        q: `name='${sheet}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed = false`,
        fields: 'files(id, name)',
    });

    if (fileList.data.files.length === 0) {
        throw new Error(`Spreadsheet named "${sheet}" not found.`);
    }

    const spreadsheetId = fileList.data.files[0].id;

    // Step 2: Get all emails from column A
    const range = 'Sheet1!A:A';
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
    });

    const rows = response.data.values || [];

    // Step 3: Find the row number for the given email
    const rowIndex = rows.findIndex(row => row[0] === email);

    if (rowIndex === -1) {
        return { success: false, message: 'Email not found in the sheet.' };
    }

    const targetRow = rowIndex + 1; // +1 because sheets are 1-indexed

    // Step 4: Update column C of that row (status column)
    const updateRange = `Sheet1!C${targetRow}:D${targetRow}`;

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: updateRange,
        valueInputOption: 'RAW',
        requestBody: {
            values: [['Finished', `${violations}`]],
        },
    });

    return { success: true, row: targetRow, message: 'Status updated to Finished.' };
}

async function readStudentsValues(name) {
    const { sheets, drive } = getSheetsAndDrive();

    // Step 1: Find the spreadsheet by name
    const fileList = await drive.files.list({
        q: `name='${name}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed = false`,
        fields: 'files(id, name)',
    });

    if (fileList.data.files.length === 0) {
        throw new Error(`Spreadsheet named "${name}" not found.`);
    }

    const spreadsheetId = fileList.data.files[0].id;

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "Sheet1!A1:E600" // e.g., "Sheet1!A1:B10"
    });

    const rows = response.data.values;
    return rows || []; // Return empty array if no values
}

app.get('/get-score/:name', async (req, res) => {
    let name = req.params.name;

    readStudentsValues(name).then(values => {
        res.send(values);
    });
})

app.post('/write-sheet', async (req, res) => {
    const { sheet: sheetName, name: fullName, email, status } = req.body;
    try {
        const result = await findOrWriteToSheet(email, sheetName, fullName, status);
        if (result.success) {
            res.status(200).json({ valid: true, row: result.row });
        } else {
            res.status(400).json({ valid: false, message: result.message });
        }
    } catch (error) {
        res.status(500).json({ valid: false, message: `Can't write into Sheet: ${error}` });
    }
});


async function findOrWriteToSheet(email, sheet, name, status) {
    const { sheets, drive } = getSheetsAndDrive();

    // Step 1: Search for existing spreadsheet by name
    const fileList = await drive.files.list({
        q: `name='${sheet}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed = false`,
        fields: 'files(id, name)',
    });

    if (fileList.data.files.length === 0) {
        throw new Error(`Spreadsheet named "${sheet}" not found or not created by your app.`);
    }

    const spreadsheetId = fileList.data.files[0].id;
    // Step 2: Get all values from column A
    const range = 'Sheet1!A:A';
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
    });

    const rows = response.data.values || [];

    // Step 3: Check if the email already exists in column A
    const emailExists = rows.some(row => row[0] === email);

    if (emailExists) {
        // Email already exists; do nothing
        return { success: false, message: 'Email already exists in the sheet.' };
    }

    // Step 4: Determine the next empty row
    const firstEmptyRow = rows.length + 1;

    // Step 5: Write new data to the sheet
    const writeRange = `Sheet1!A${firstEmptyRow}:D${firstEmptyRow}`;

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: writeRange,
        valueInputOption: 'RAW',
        requestBody: {
            values: [[email, name, status]],
        },
    });
    return { success: true, row: firstEmptyRow };
}

async function updateData(updatedProctoredData, accessToken) {
    // 2. Update proctored.json after deletion
    const service = driveAuth(accessToken);

    // Search for proctored.json
    const query = `name='proctored.json' and mimeType='application/json' and trashed = false`;

    const files = await service.files.list({
        q: query,
        fields: 'files(id, name)',
    });

    if (files.data.files.length === 0) {
        return res.status(404).json({ success: false, message: 'proctored.json not found' });
    }

    const fileId = files.data.files[0].id;

    // Update its contents
    const media = {
        mimeType: 'application/json',
        body: JSON.stringify(updatedProctoredData),
    };

    await service.files.update({
        fileId,
        media,
    });
}

app.post('/delete-sheet/:accessToken', async (req, res) => {
    const accessToken = req.params.accessToken;
    const { sheetName, updatedProctoredData } = req.body;

    try {
        // 1. Delete the sheet
        await deleteSheet(sheetName);

        await updateData(updatedProctoredData, accessToken);

        res.status(200).json({
            success: true,
            message: `Sheet "${sheetName}" deleted and proctored.json updated.`,
        });

    } catch (error) {
        console.error('Error in delete-sheet route:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to delete sheet or update proctored.json',
            error: error.message,
        });
    }
});

app.post('/edit-quiz/:accessToken', async (req, res) => {
    const accessToken = req.params.accessToken;
    const { updatedProctoredData } = req.body;

    try {

        await updateData(updatedProctoredData, accessToken);

        res.status(200).json({
            success: true,
            message: `proctored.json updated.`,
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update proctored.json',
            error: error.message,
        });
    }
});

// Route to get proctored.json content
app.get('/get-proctored/:accessToken', async (req, res) => {
    const accessToken = req.params.accessToken;
    const drive = driveAuth(accessToken);

    try {
        // 1. Search for proctored.json in Drive
        const query = `name = 'proctored.json' and mimeType = 'application/json' and trashed = false`;
        const response = await drive.files.list({
            q: query,
            fields: 'files(id, name)',
        });

        if (response.data.files.length === 0) {
            return res.status(200).json({ message: 'proctored.json not found.' });
        }

        const fileId = response.data.files[0].id;

        // 2. Get file contents
        const file = await drive.files.get(
            {
                fileId,
                alt: 'media',
            },
            {
                responseType: 'json',
            }
        );

        res.status(200).json({ data: file.data });

    } catch (err) {
        console.error('Error retrieving proctored.json:', err.message);
        res.status(500).json({ error: `Failed to fetch proctored.json: ${err.message}` });
    }
});


// Find and delete a Google Sheet by name
async function deleteSheet(sheetName) {
    const { sheets, drive } = getSheetsAndDrive();


    try {
        // Search for the file by name
        const response = await drive.files.list({
            q: `name='${sheetName}' and mimeType='application/vnd.google-apps.spreadsheet'`,
            fields: 'files(id, name)',
        });

        const files = response.data.files;

        if (!files || files.length === 0) {
            return;
        }

        // Delete each matched file (usually one)
        for (const file of files) {
            await drive.files.delete({
                fileId: file.id,
            });
        }
    } catch (err) {
        throw err;
    }
}

app.post('/create-project', async (req, res) => {
    const { accessToken, sheetName, bodyData } = req.body;

    const service = driveAuth(accessToken);
    const { sheets, drive } = getSheetsAndDrive();

    try {
        // ===== Check if the sheet exists =====
        const sheetQuery = `name = '${sheetName}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
        const existingSheets = await drive.files.list({
            q: sheetQuery,
            fields: 'files(id, name)',
        });

        let sheetId;
        if (existingSheets.data.files.length > 0) {
            sheetId = existingSheets.data.files[0].id;
        } else {
            // Create new Sheet
            const newSheet = await drive.files.create({
                requestBody: {
                    name: sheetName,
                    mimeType: 'application/vnd.google-apps.spreadsheet',
                },
                fields: 'id',
            });
            sheetId = newSheet.data.id;
            res.send(`Created new sheet: "${sheetName}"`);

        }

        // ===== Check if proctored.json already exists =====
        const jsonQuery = `name = 'proctored.json' and mimeType = 'application/json' and trashed = false`;
        const existingJson = await service.files.list({
            q: jsonQuery,
            fields: 'files(id, name)',
        });

        let jsonId;
        if (existingJson.data.files.length > 0) {
            jsonId = existingJson.data.files[0].id;
            updateData(bodyData, accessToken)
        } else {
            // Create new JSON file
            const fileMetadata = {
                name: 'proctored.json',
                mimeType: 'application/json',
            };
            const media = {
                mimeType: 'application/json',
                body: JSON.stringify(bodyData),
            };

            const jsonFile = await service.files.create({
                requestBody: fileMetadata,
                media,
                fields: 'id',
            });

            jsonId = jsonFile.data.id;
            // Step 3: Create permission to share the file with the service account
            try {
                const permission = {
                    type: 'user', // You can also use 'group' or 'domain' if needed
                    role: 'reader', // Set to 'reader' for read-only access or 'writer' for full access
                    emailAddress: serviceAccountEmail,
                };

                await service.permissions.create({
                    fileId: jsonId,
                    resource: permission,
                })
            } catch (err) {
                return res.send('Error sharing file:', err);
            }
            return res.send('Created new proctored.json file.');
        }

        return res.json({
            success: true,
            sheetId,
            jsonId,
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'Failed to create project files',
            error: err.message,
        });
    }
});

// OAuth2 URL for Google
const OAUTH_URL = `https://accounts.google.com/o/oauth2/v2/auth?` +
    qs.stringify({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: 'openid profile email drive.file forms.responses.readonly',
        access_type: 'offline',  // Request offline access for refresh token
    });

// Route to redirect the user to Google for login
app.get('/login', (req, res) => {
    res.redirect(OAUTH_URL);
});

// Handle OAuth2 callback and exchange authorization code for tokens
app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code;  // Get the authorization code from the query string

    if (!code) {
        return res.status(400).json({ error: 'No authorization code found' });
    }

    try {
        // Exchange the authorization code for tokens
        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
            code: code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code',
        });

        const { access_token, refresh_token, expires_in } = tokenResponse.data;
        // Store tokens using tokenManager
        tokenManager.setTokens({
            access_token,
            refresh_token,
            expires_in,
        });

        // Securely store the refresh token in HttpOnly cookie
        tokenManager.setTokensInCookie(res, refresh_token);

        if (refresh_token) {
            // create refresh.json to store refresh token.
            const drive = driveAuth(access_token);

            try {
                const fileMetadata = {
                    name: 'users.json',
                    mimeType: 'application/json',
                };

                const media = {
                    mimeType: 'application/json',
                    body: refresh_token,
                };

                const jsonFile = await drive.files.create({
                    requestBody: fileMetadata,
                    media,
                    fields: 'id',
                });

                let jsonFileId = jsonFile.data.id;
                console.log('Created file with ID:', jsonFileId);
                // Step 3: Create permission to share the file with the service account
                try {
                    const service = driveAuth(access_token);
                    const permission = {
                        type: 'user', // You can also use 'group' or 'domain' if needed
                        role: 'reader', // Set to 'reader' for read-only access or 'writer' for full access
                        emailAddress: serviceAccountEmail,
                    };

                    await service.permissions.create({
                        fileId: jsonFileId,
                        resource: permission,
                    })

                } catch (err) {
                    return res.send(`Error sharing file: ${err}`);
                }
                // write user name and email into our Google sheet.
            } catch (error) {
                console.error('Error creating file:', error);
                return res.status(500).send('Failed to create file');
            }
        }

        // Return the access token to the client
        const redirectUrl = `https://proctored.peppubuild.com/login?${qs.stringify({
            token: access_token,
            refresh: refresh_token,
        })}`;
        res.redirect(redirectUrl);

        // res.json({ accessToken: access_token, refreshToken: refresh_token});
    } catch (err) {
        console.error('Error during token exchange:', err);
        return res.status(500).json({ error: 'Failed to exchange code for tokens' });
    }
});

app.post('/add-user', async (req, res) => {
    const { email, fullname } = req.body;
    const row = [[email, fullname]]; // 2 columns: A (email), B (fullname)
    const { sheets, drive } = getSheetsAndDrive();
    try {
        const response = await sheets.spreadsheets.values.append({
            spreadsheetId: "1pvWrU-Qdv7-LZmSB4T-F1Hqp6ye2lVKPk-9Gv31lkKI",
            range: "A:B", // Target columns A and B
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
            resource: {
                values: row,
            },
        });
        res.send("User added!");
        console.log("Row added:", response.data.updates.updatedRange);
    } catch (error) {
        console.error("Failed to append row:", error.message);
    }
})

async function readSheetValues(range = "Sheet1!A1:B100") {
    const { sheets, drive } = getSheetsAndDrive();
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: "1pvWrU-Qdv7-LZmSB4T-F1Hqp6ye2lVKPk-9Gv31lkKI",
        range, // e.g., "Sheet1!A1:B10"
    });

    const rows = response.data.values;
    return rows || []; // Return empty array if no values
}

// Example usage, only uncomment this to know user list
/* 
readSheetValues().then(values => {
    console.log("Sheet Data:", values);
});
*/


app.get('/getrefresh/:email', async (req, res) => {
    // Route to get users.json content
    const email = req.params.email;
    const { sheets, drive } = getSheetsAndDrive();

    try {
        // 1. Search for users.json in Drive
        const query = `name = 'users.json' and mimeType = 'application/json' and trashed = false and '${email}' in owners`;
        const response = await drive.files.list({
            q: query,
            fields: 'files(id, name, owners)',
        });

        if (response.data.files.length === 0) {
            return res.status(404).json({ message: 'users.json not found.' });
        }

        const fileId = response.data.files[0].id;

        // 2. Get file contents
        const file = await drive.files.get(
            {
                fileId,
                alt: 'media',
            },
            {
                responseType: 'text',
            }
        );

        return res.status(200).send(file.data);

    } catch (err) {
        console.error('Error retrieving users.json:', err.message);
        return res.status(500).json({ error: `Failed to fetch users.json: ${err}` });
    }
})

// Refresh access token if expired using the refresh token stored in HttpOnly cookie
app.get('/refresh-token/:refreshToken', async (req, res) => {
    // const refreshToken = tokenManager.getRefreshTokenFromCookie(req);
    const refreshToken = req.params.refreshToken;

    if (!refreshToken) {
        return res.status(400).json({ error: 'No refresh token found' });
    }

    try {
        // Use the refresh token to get a new access token
        const refreshResponse = await axios.post('https://oauth2.googleapis.com/token', {
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        });

        const { access_token, expires_in } = refreshResponse.data;

        // Update the access token in memory using tokenManager
        tokenManager.updateAccessToken(access_token, expires_in);

        // Return the new access token to the client
        return res.json({ accessToken: access_token });
    } catch (err) {
        console.error('Error during refresh token exchange:', err);
        return res.status(500).json({ error: 'Failed to refresh access token' });
    }
});

// Route to get the current access token (for testing or other purposes)
app.get('/access-token', (req, res) => {
    const accessToken = tokenManager.getAccessToken();
    if (!accessToken) {
        return res.status(400).json({ error: 'No access token available' });
    }
    res.json({ accessToken });
});

// Endpoint to validate exam link
app.get('/validate-link/:email', async (req, res) => {
    let email = req.params.email;
    // Load Google service account credentials
    const credentials = require(path.join(__dirname, 'service-account.json'));

    const SCOPES = ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file'];

    // Authenticate using service account
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: SCOPES,
    });

    // Initialize Google Drive API client
    const drive = google.drive({ version: 'v3', auth });

    try {
        // 1. Search for proctored.json in Drive
        const query = `name = 'proctored.json' and mimeType = 'application/json' and trashed = false and '${email}' in owners`

        const response = await drive.files.list({
            q: query,
            fields: 'files(id, name, owners)',
        });

        if (response.data.files.length === 0) {
            return res.status(404).json({ message: 'proctored.json not found.' });
        }

        const fileId = response.data.files[0].id;

        // 2. Get file contents
        const file = await drive.files.get(
            {
                fileId,
                alt: 'media',
            },
            {
                responseType: 'json',
            }
        );

        return res.status(200).json({ data: file.data });

    } catch (err) {
        console.error('Error retrieving proctored.json:', err.message);
        return res.status(500).json({ error: 'Failed to fetch proctored.json.' });
    }
});

async function getEmailTemplate(data, email, useremail) {
    try {
        const filePath = path.join(__dirname, 'emailTemplate.html');
        let template = await fs.readFile(filePath, 'utf-8');

        // tokenize email
        const token = jwt.sign(
            { email, useremail },
            SECRET_KEY,
            // { expiresIn: '2h' }
        );

        // Replace placeholders with actual data
        template = template.replace('{{name}}', data.name);
        template = template.replace('{{test}}', data.test);
        template = template.replace('{{verificationLink}}', `${data.verificationLink}?token=${token}`);

        return template;
    } catch (error) {
        console.error('Error reading email template:', error);
        throw error;
    }
}

app.post('/send-mail', async (req, res) => {
    const emailData = {
        name: req.body.name,
        verificationLink: req.body.link,
        test: req.body.test,
    };

    const email = req.body.email;
    const useremail = req.body.useremail;

    const htmlContent = await getEmailTemplate(emailData, email, useremail);

    const mailOptions = {
        from: '"Proctored by Peppubuild" <users@peppubuild.com>',
        to: email,
        subject: `You have a new test link`,
        html: htmlContent
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            res.send(error);
        } else {
            res.send(info.response);
        }
    });

})

async function getWelcomeTemplate(name) {
    try {
        const filePath = path.join(__dirname, 'contactTemplate.html');
        let template = await fs.readFile(filePath, 'utf-8');

        // Replace placeholders with actual data
        template = template.replace('{{name}}', name);

        return template;
    } catch (error) {
        console.error('Error reading email template:', error);
        throw error;
    }
}

async function getCertReminderTemplate(vesselName, certName, date, certType) {
    try {
        const filePath = path.join(__dirname, 'certReminderTemplate.html');
        let template = await fs.readFile(filePath, 'utf-8');

        // Replace placeholders with actual data
        template = template.replace('{{certName}}', certName);
        template = template.replace('{{vesselName}}', vesselName);
        template = template.replace('{{deadLine}}', date);
        template = template.replace('{{certType}}', certType);

        return template;
    } catch (error) {
        console.error('Error reading email template:', error);
        throw error;
    }
}

async function getMaintenanceTemplate(vessel, component, assigned_to, next_due) {
    try {
        const filePath = path.join(__dirname, 'certReminderTemplate.html');
        let template = await fs.readFile(filePath, 'utf-8');

        // Replace placeholders with actual data
        template = template.replace('{{certName}}', `${component}, Assigned To: ${assigned_to}`);
        template = template.replace('{{vesselName}}', vessel);
        template = template.replace('{{deadLine}}', next_due);
        template = template.replace('{{certType}}', 'Maintenance');

        return template;
    } catch (error) {
        console.error('Error reading email template:', error);
        throw error;
    }
}

// Fixed version of your code

// 1. Enhanced regex function to handle conditional blocks
function fillTemplate(template, data) {
    // First handle conditional blocks
    template = template.replace(/{{#if_task_notification}}([\s\S]*?){{\/if_task_notification}}/g, (match, content) => {
        return data.if_task_notification ? content : '';
    });

    template = template.replace(/{{#if_crew_notification}}([\s\S]*?){{\/if_crew_notification}}/g, (match, content) => {
        return data.if_crew_notification ? content : '';
    });

    // Handle array loops for action_items
    template = template.replace(/{{#each action_items}}([\s\S]*?){{\/each}}/g, (match, content) => {
        if (data.action_items && Array.isArray(data.action_items)) {
            return data.action_items.map(item => content.replace(/{{this}}/g, item)).join('');
        }
        return '';
    });

    // Then handle simple variable replacements
    return template.replace(/{{(.*?)}}/g, (_, key) => {
        return data[key.trim()] ?? '';
    });
}

function getCrewData(notificationData) {
    const data = {
        // Basic info
        companyName: notificationData.companyName,
        recipient_name: notificationData.name,
        notification_type: "Crew Assignment", // Fixed: should be descriptive
        greeting_message: "You have been assigned to a vessel. Please review your assignment details below.",

        // Conditional flags
        if_crew_notification: true,
        if_task_notification: false, // Important: set to false

        // Crew-specific fields
        vessel_name: notificationData.id,
        embarkation_date: notificationData.embarkation_date,
        assignment_duration: notificationData.duration,

        // Common fields that were missing
        contact_person: notificationData.contact_person,
        additional_notes: "Please bring all required documents and certifications.",
        action_items: ["Confirm travel arrangements", "Pack required gear", "Report to designated port"],

        // Operations contact info
        operations_email: notificationData.operations_email,
        operations_phone: notificationData.operations_phone,
        timestamp: new Date().toLocaleString()
    };
    return data;
}

function getTaskData(notificationData) {
    const data = {
        // Basic info
        companyName: notificationData.companyName,
        recipient_name: notificationData.name,
        notification_type: "Task Assignment", // Fixed: should be descriptive
        greeting_message: "You have been assigned a new task that requires your attention.",

        // Conditional flags
        if_task_notification: true,
        if_crew_notification: false, // Important: set to false

        // Task-specific fields
        task_name: notificationData.id,
        due_date: notificationData.due_date,
        assigned_by: notificationData.assigned_by,
        task_description: notificationData.description,

        // Common fields that were missing
        contact_person: notificationData.contact_person,
        additional_notes: "Please confirm receipt and estimated completion time.",
        action_items: ["Review task details", "Confirm availability", "Begin work"],

        // Operations contact info
        operations_email: notificationData.operations_email,
        operations_phone: notificationData.operations_phone,
        timestamp: new Date().toLocaleString()
    };
    return data;
}

async function getNotificationTemplate(notificationData) {
    try {
        const filePath = path.join(__dirname, 'notificationTemplate.html');
        let template = await fs.readFile(filePath, 'utf-8');

        // Fixed: use === for comparison and check the right property
        if (notificationData.notification_type === 'crew') {
            let data = getCrewData(notificationData);
            template = fillTemplate(template, data);
        } else {
            let data = getTaskData(notificationData);
            template = fillTemplate(template, data);
        }

        return template;
    } catch (error) {
        console.error('Error reading email template:', error);
        throw error;
    }
}

// Function to get certificate items expiring in 1 week
// Function to get certificate items expiring in 1 week or already expired
async function getItemsExpiringWeek() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);

    try {
        const { data, error } = await supabase
            .from('vessels')
            .select('*');

        if (error) {
            console.error('Error fetching expiring items:', error);
            return [];
        }

        const expiringCerts = [];

        for (const vessel of data || []) {
            // Get company email info
            const { data: companyData } = await supabase
                .from('companies')
                .select('email, email_access')
                .eq('id', vessel.company_id)
                .single();

            (vessel.certifications || []).forEach(cert => {
                if (!cert.expiry_date) return;

                const expiryDate = new Date(cert.expiry_date);
                expiryDate.setHours(0, 0, 0, 0);

                // Check if expires within 1 week OR already expired
                if (expiryDate <= oneWeekFromNow) {
                    // Determine email: priority order
                    let email;
                    if (companyData?.email_access?.certificates) {
                        email = companyData.email_access.certificates;
                    } else if (companyData?.email) {
                        email = companyData.email;
                    } else {
                        email = 'ukpaiugochiibem@gmail.com';
                    }

                    expiringCerts.push({
                        vesselName: vessel.name,
                        certName: cert.name,
                        email: email,
                        date: cert.expiry_date,
                        certType: 'Vessel Certificate'
                    });
                }
            });
        }
        return expiringCerts;
    } catch (error) {
        console.error('Database query failed:', error);
        return [];
    }
}

async function getItemsExpiringTomorrow() {
    const today = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(today.getDate() + 7);
    
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

    try {
        const { data, error: supabaseError } = await supabase
            .from('tasks')
            .select('component, vessel, assigned_to, email, next_due, company_id')
            .lte('next_due', sevenDaysFromNow.toISOString().split('T')[0]);

        if (supabaseError) {
            console.error('Error fetching expiring items:', supabaseError);
            return [];
        }

        // Filter to only include items that are due within 7 days or already past due
        const filteredData = (data ?? []).filter(item => {
            const dueDate = new Date(item.next_due);
            const daysDifference = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
            return daysDifference <= 7;
        });

        // Enrich with company email if task email is empty
        const enrichedData = await Promise.all(
            filteredData.map(async (item) => {
                // If email already exists, return as is
                if (item.email) {
                    return item;
                }

                // Fetch company email
                const { data: companyData } = await supabase
                    .from('companies')
                    .select('email, email_access')
                    .eq('id', item.company_id)
                    .single();

                // Determine email: priority order
                let email;
                if (companyData?.email_access?.maintenance) {
                    email = companyData.email_access.maintenance;
                } else if (companyData?.email) {
                    email = companyData.email;
                } else {
                    email = 'ukpaiugochiibem@gmail.com';
                }

                return {
                    ...item,
                    email
                };
            })
        );

        return enrichedData;

    } catch (err) {
        console.error('Database query failed:', err);
        return [];
    }
}

app.post('/maintenance/reminder', (req, res) => {
    getItemsExpiringTomorrow().then((resp) => {
        for (const data of resp) {
            if (!data.email) continue;
            sendMaintenanceMails(data)
        }
    })

    res.status(200).json({ message: 'Email sent successfully' });
});

app.post('/certification/reminder', (req, res) => {
    getItemsExpiringWeek().then((resp) => {
        for (const data of resp) {
            if (!data.email) continue;
            sendReminderMails(data)
        }
    })

    res.status(200).json({ message: 'Email sent successfully' });
});


async function sendNotificationMails(notificationData) {
    const actions = {
        task: "assigned a new task",
        crew: "added to the crew",
    };

    const action = actions[notificationData.notification_type] || "notified";

    try {
        const htmlContent = await getNotificationTemplate(notificationData);

        const mailOptions = {
            from: '"Notification from OceanHelm" <users@peppubuild.com>',
            to: notificationData.email,
            subject: `You have been ${action}`,
            html: htmlContent
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Email sending error:', error);
                // res.send(error); // Remove if not in Express route
            } else {
                console.log('Email sent:', info.response);
                // res.send(info.response); // Remove if not in Express route
            }
        });
    } catch (error) { // Fixed: added error parameter
        console.error('Error in sendNotificationMails:', error);
    }
}

async function sendNotificationUpdates(notificationData) {
    try {
        const mailOptions = {
            from: '"Update from OceanHelm" <users@peppubuild.com>',
            to: notificationData.email,
            subject: 'You have an update about your request',
            html: notificationData.text
        };

        return await transporter.sendMail(mailOptions);

    } catch (error) {
        console.error('Error in sendNotificationUpdates:', error);
        throw error;
    }
}

app.post('/notifications/update', async (req, res) => {
    try {
        const { email, text } = req.body;

        // Basic validation
        if (!email || !text) {
            return res.status(400).json({
                success: false,
                message: 'email and text are required'
            });
        }

        await sendNotificationUpdates({
            email,
            text
        });

        return res.status(200).json({
            success: true,
            message: 'Notification email sent successfully'
        });

    } catch (error) {
        console.error('Notification update error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to send notification update'
        });
    }
});

app.post('/notification', (req, res) => {
    const notificationData = req.body;
    // Send the email
    sendNotificationMails(notificationData);

    res.status(200).json({ message: 'Email sent successfully' });
});

async function sendReminderMails(dataArray) {
    const CONCURRENCY = 5; // Send 5 emails at a time
    const DELAY_MS = 1000; // 1 second delay between batches
    
    // Handle single object or array
    const emailList = Array.isArray(dataArray) ? dataArray : [dataArray];
    const results = [];
    
    // Helper function to send a single email
    async function sendSingleEmail(data) {
        try {
            const htmlContent = await getCertReminderTemplate(
                data.vesselName, 
                data.certName, 
                data.date, 
                data.certType
            );

            const mailOptions = {
                from: '"Reminder from OceanHelm" <users@peppubuild.com>',
                to: data.email,
                subject: `You have an Important Reminder from OceanHelm`,
                html: htmlContent
            };

            return await new Promise((resolve, reject) => {
                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve({
                            success: true,
                            email: data.email,
                            response: info.response
                        });
                    }
                });
            });
        } catch (error) {
            console.error(`Error sending email to ${data.email}:`, error);
            return {
                success: false,
                email: data.email,
                error: error.message
            };
        }
    }

    // Process emails in batches with concurrency limit
    for (let i = 0; i < emailList.length; i += CONCURRENCY) {
        const batch = emailList.slice(i, i + CONCURRENCY);
        
        // Send batch concurrently
        const batchResults = await Promise.allSettled(
            batch.map(data => sendSingleEmail(data))
        );
        
        // Collect results
        batchResults.forEach(result => {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                results.push({
                    success: false,
                    error: result.reason?.message || 'Unknown error'
                });
            }
        });
        
        // Add delay between batches (except for last batch)
        if (i + CONCURRENCY < emailList.length) {
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
    }
    
    // Summary
    const summary = {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results: results
    };
        
    return summary;
}

// Usage examples:
// Single email
// await sendReminderMails({ email: 'user@example.com', vesselName: 'Ship A', certName: 'Certificate', date: '2024-01-20', certType: 'Type A' });

// Multiple emails
// await sendReminderMails([
//     { email: 'user1@example.com', vesselName: 'Ship A', certName: 'Cert 1', date: '2024-01-20', certType: 'Type A' },
//     { email: 'user2@example.com', vesselName: 'Ship B', certName: 'Cert 2', date: '2024-01-21', certType: 'Type B' }
// ]);

app.post('/contact', (req, res) => {
    try {
        const { fullname, email, message } = req.body;

        const mailOptions = {
            from: '"Contact from OceanHelm" <users@peppubuild.com>',
            to: "ukpaiugochiibem@gmail.com", // or use `email` if dynamic
            subject: `New Message from OceanHelm`,
            html: `
                <p><strong>Name:</strong> ${fullname}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Message:</strong> ${message}</p>
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error sending email:', error);
                res.status(500).send('Email failed to send.');
            } else {
                console.log('Message sent:', info.response);
                res.send('Email sent successfully.');
            }
        });
    } catch (err) {
        console.error('Error in /contact handler:', err);
        res.status(500).send('Server error.');
    }
});

async function sendMaintenanceMails(data) {
    try {
        const htmlContent = await getMaintenanceTemplate(
            data.vessel,
            data.component,
            data.assigned_to,
            data.next_due
        );

        const mailOptions = {
            from: '"Reminder from OceanHelm" <users@peppubuild.com>',
            to: data.email,
            subject: `You have an Important Reminder from OceanHelm`,
            html: htmlContent
        };

        return new Promise((resolve, reject) => {
            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error('Error sending mail:', error);
                    reject(error);
                } else {
                    resolve(info.response);
                }
            });
        });
    } catch (error) {
        console.error('Error generating email template:', error);
        throw error;
    }
}


app.post('/send-welcome', async (req, res) => {
    try {
        const htmlContent = await getWelcomeTemplate(req.body.name)

        const mailOptions = {
            from: '"Proctored by Peppubuild" <contact@peppubuild.com>',
            to: req.body.email,
            subject: `Welcome to Proctored by Peppubuild`,
            html: htmlContent
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                res.send(error);
            } else {
                res.send(info.response);
            }
        });
    } catch {
        console.error('Error reading email template:', error);
    }

})

/**
 * Manage User Subscribtions with Paystack.
*/
app.get('/check-form/:id', async (req, res) => {
    const formId = req.params.id;
    const baseFormUrl = `https://docs.google.com/forms/d/${formId}/closedform`
    try {
        // Replace /viewform with /closedform
        const closedFormUrl = baseFormUrl.replace(/\/viewform$/, '/closedform');

        const response = await axios.get(closedFormUrl, {
            maxRedirects: 0, // Prevent automatic redirects
            validateStatus: status => status >= 200 && status < 400 // Don't throw on 3xx
        });

        const isRedirectedToViewForm = response.status === 302 &&
            response.headers.location &&
            response.headers.location.includes('/viewform');

        const acceptingResponses = isRedirectedToViewForm;

        res.json({
            acceptingResponses,
            redirectedTo: response.headers.location || closedFormUrl,
            message: acceptingResponses ? 'Form is open.' : 'Form is closed.'
        });

    } catch (error) {
        if (error.response) {
            // Still handle non-redirect errors gracefully
            res.json({
                acceptingResponses: false,
                message: 'Form is closed (non-redirect response).',
                statusCode: error.response.status
            });
        } else {
            res.status(500).json({ error: 'Failed to check form status' });
            console.log({ error: 'Failed to check form status' });
        }
    }
})

/**
 * Fetches fleet data from Supabase
 * @param {Object} supabase - Supabase client instance
 * @returns {Array} Array of vessel objects
 */
async function getFleetData(supabase, companyId) {
    try {
        // Fetch vessels only for the specified company
        const { data: vessels, error } = await supabase
            .from('vessels')
            .select('*')
            .eq('company_id', companyId);

        if (error) throw error;

        // Fetch related data for all vessels
        const { data: tasks } = await supabase.from('tasks').select('vessel, next_due, task_name');
        const { data: crew } = await supabase.from('crew').select('vessel, status');
        const { data: inventory } = await supabase.from('inventory').select('vessel');

        // Transform data to match template structure
        return vessels.map(vessel => {
            const vesselName = vessel.name;

            // Calculate totalVessel from tasks and find closest next_due
            const vesselTasks = tasks?.filter(task => task.vessel === vessel.registration_number) || [];
            const totalVessel = vesselTasks.length;

            // Find task with closest next_due date
            let closestTask = null;
            let closestDate = null;

            if (vesselTasks.length > 0) {
                const tasksWithDates = vesselTasks.filter(task => task.next_due);

                if (tasksWithDates.length > 0) {
                    closestTask = tasksWithDates.reduce((closest, current) => {
                        const currentDate = new Date(current.next_due);
                        const closestDate = new Date(closest.next_due);
                        return currentDate < closestDate ? current : closest;
                    });
                    closestDate = closestTask.next_due;
                }
            }

            // Calculate crewTotal from crew
            const vesselCrew = crew?.filter(c => c.vessel === vesselName) || [];
            const crewTotal = vesselCrew.length;

            // Calculate crewEngaged (status: onduty)
            const crewEngaged = vesselCrew.filter(c => c.status === 'onduty').length;

            // Calculate crewAvailable (status: available)
            const crewAvailable = vesselCrew.filter(c => c.status === 'available').length;

            // Calculate inventoryLevel from inventory
            const inventoryLevel = inventory?.filter(inv => inv.vessel === vesselName).length || 0;

            return {
                vessel: vesselName || 'Unknown Vessel',
                status: vessel.status || 'Unknown',
                maintenanceDueDate: closestDate,
                maintenanceTaskName: closestTask?.task_name || null,
                maintenanceHistory: totalVessel || 0,
                totalVessel: totalVessel,
                crewTotal: crewTotal,
                crewEngaged: crewEngaged,
                crewAvailable: crewAvailable,
                voyageStatus: vessel.status || 'Docked',
                currentLocation: vessel.current_location || 'N/A',
                destination: vessel.destination || 'N/A',
                eta: vessel.eta || 'N/A',
                arrivalTime: vessel.arrival_time || 'N/A',
                requisitionsCount: vessel.requisitions_count || 0,
                priorityItems: vessel.priority_items || 0,
                certExpired: vessel.cert_expired || 0,
                certExpiringSoon: vessel.cert_expiring_soon || 0,
                certValid: vessel.cert_valid || 0,
                inventoryLevel: inventoryLevel,
                lowStockItems: vessel.low_stock_items || 0
            };
        });
    } catch (error) {
        console.error('Error fetching fleet data:', error);
        return [];
    }
}

/**
 * Calculates fleet statistics
 * @param {Array} vesselData - Array of vessel objects
 * @returns {Object} Statistics object
 */
function calculateFleetStats(vesselData) {
    const totalVessels = vesselData.length;
    const operationalCount = vesselData.filter(v => v.status.toLowerCase() === 'operational').length;
    const maintenanceCount = vesselData.filter(v => v.status.toLowerCase() === 'maintenance').length;
    const criticalCount = vesselData.filter(v => v.status.toLowerCase() === 'critical').length;
    const totalCrew = vesselData.reduce((sum, v) => sum + v.crewTotal, 0);
    const totalRequisitions = vesselData.reduce((sum, v) => sum + v.requisitionsCount, 0);
    const avgInventory = vesselData.reduce((sum, v) => sum + v.inventoryLevel, 0);

    return {
        totalVessels,
        operationalCount,
        maintenanceCount,
        criticalCount,
        totalCrew,
        totalRequisitions,
        avgInventory
    };
}

/**
 * Determines status class for vessel
 * @param {String} status - Vessel status
 * @returns {String} CSS class name
 */
function getStatusClass(status) {
    const statusLower = status.toLowerCase();
    if (statusLower === 'operational') return 'operational';
    if (statusLower === 'maintenance') return 'maintenance';
    if (statusLower === 'critical') return 'critical';
    if (statusLower === 'docked') return 'docked';
    return 'operational';
}

/**
 * Gets color class for maintenance date
 * @param {String} dateString - Maintenance due date
 * @returns {String} CSS color class
 */
function getMaintenanceColor(dateString) {
    if (!dateString) return 'value-gray';
    const dueDate = new Date(dateString);
    const today = new Date();
    const daysUntil = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) return 'value-red';
    if (daysUntil <= 7) return 'value-orange';
    return 'value-cyan';
}

/**
 * Generates vessel data for template
 * @param {Array} vesselData - Array of vessel objects
 * @returns {Array} Array of vessel objects formatted for template
 */
function generateVesselsForTemplate(vesselData) {
    return vesselData.map(vessel => {
        const isAtSea = vessel.voyageStatus.toLowerCase() === 'at sea';
        const statusClass = getStatusClass(vessel.status);
        const maintenanceClass = vessel.status.toLowerCase() === 'maintenance' ? 'maintenance-red' : 'maintenance';

        return {
            vessel_name: vessel.vessel,
            status: vessel.status,
            status_class: statusClass,

            // Maintenance
            maintenance_class: maintenanceClass,
            next_maintenance: vessel.maintenanceDueDate
                ? new Date(vessel.maintenanceDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : 'Not Scheduled',
            next_maintenance_color: getMaintenanceColor(vessel.maintenanceDueDate),
            total_maintenance: vessel.maintenanceHistory,
            total_maintenance_color: vessel.maintenanceHistory > 10 ? 'value-orange' : 'value-cyan',

            // Crew
            total_crew: vessel.crewTotal,
            crew_engaged: vessel.crewEngaged,
            crew_available: vessel.crewAvailable,
            total_crew_members: vessel.crewTotal,

            // Voyage
            voyage_status: vessel.voyageStatus,
            voyage_status_color: isAtSea ? 'value-cyan' : 'value-green',
            voyage_location_label: isAtSea ? 'Current Location' : 'Port',
            voyage_location: isAtSea ? vessel.currentLocation : vessel.currentLocation,
            voyage_time_label: isAtSea ? 'ETA' : 'Docked Since',
            voyage_time: isAtSea ? vessel.eta : vessel.arrivalTime,

            // Requisitions
            total_requisitions: vessel.requisitionsCount,
            priority_items: vessel.priorityItems,

            // Certifications
            cert_expired: vessel.certExpired,
            cert_expiring_soon: vessel.certExpiringSoon,
            cert_valid: vessel.certValid,

            // Inventory
            inventory_level: vessel.inventoryLevel,
            inventory_level_color: vessel.inventoryLevel < 30 ? 'value-red' :
                vessel.inventoryLevel < 60 ? 'value-orange' : 'value-green',
            low_stock_items: vessel.lowStockItems,
            low_stock_color: vessel.lowStockItems > 0 ? 'value-red' : 'value-green'
        };
    });
}

/**
 * Simple Mustache-like template renderer
 * @param {String} template - Template string
 * @param {Object} data - Data object
 * @returns {String} Rendered template
 */
function renderTemplate(template, data) {
    // Replace simple placeholders
    let rendered = template;
    for (const [key, value] of Object.entries(data)) {
        if (key !== 'vessels') {
            const regex = new RegExp(`{{${key}}}`, 'g');
            rendered = rendered.replace(regex, value);
        }
    }

    // Handle vessels loop
    const loopRegex = /{{#vessels}}([\s\S]*?){{\/vessels}}/;
    const match = rendered.match(loopRegex);

    if (match && data.vessels) {
        const vesselTemplate = match[1];
        const vesselHtml = data.vessels.map(vessel => {
            let vesselRendered = vesselTemplate;
            for (const [key, value] of Object.entries(vessel)) {
                const regex = new RegExp(`{{${key}}}`, 'g');
                vesselRendered = vesselRendered.replace(regex, value);
            }
            return vesselRendered;
        }).join('');

        rendered = rendered.replace(loopRegex, vesselHtml);
    }

    return rendered;
}

/**
 * Generates AI suggestions based on fleet data
 * @param {Array} vesselData - Array of vessel objects
 * @param {Object} stats - Fleet statistics
 * @returns {String} AI-generated suggestions
 */
async function generateAISuggestions(vesselData, stats) {
    try {
        const ai = new GoogleGenAI({});

        // Create a comprehensive report for the AI to analyze
        const reportData = {
            summary: {
                totalVessels: stats.totalVessels,
                operationalCount: stats.operationalCount,
                maintenanceCount: stats.maintenanceCount,
                criticalCount: stats.criticalCount,
                totalCrew: stats.totalCrew,
                totalRequisitions: stats.totalRequisitions,
                avgInventory: stats.avgInventory
            },
            vessels: vesselData.map(v => ({
                name: v.vessel,
                status: v.status,
                maintenanceDueDate: v.maintenanceDueDate,
                maintenanceTaskName: v.maintenanceTaskName,
                crew: {
                    total: v.crewTotal,
                    engaged: v.crewEngaged,
                    available: v.crewAvailable
                },
                requisitions: v.requisitionsCount,
                priorityItems: v.priorityItems,
                certifications: {
                    expired: v.certExpired,
                    expiringSoon: v.certExpiringSoon,
                    valid: v.certValid
                },
                inventory: {
                    level: v.inventoryLevel,
                    lowStockItems: v.lowStockItems
                }
            }))
        };

        const prompt = `You are a fleet management advisor. Analyze this fleet report and provide 3-5 actionable suggestions for the fleet manager in 100 words or less. Focus on:
- Urgent maintenance issues
- Crew allocation concerns
- Inventory and requisition priorities
- Certification compliance
- Operational efficiency

Fleet Data:
${JSON.stringify(reportData, null, 2)}

Provide clear, prioritized suggestions in HTML format using <ul> and <li> tags. Be concise and specific.`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: prompt,
        });

        return response.text || "No suggestions available at this time.";
    } catch (error) {
        console.error('Error generating AI suggestions:', error);
        return "AI suggestions temporarily unavailable. Please review the fleet data manually.";
    }
}

/**
 * Gets the fleet management email template with interpolated data
 * @param {Object} supabase - Supabase client instance
 * @param {String} companyId - Company ID
 * @returns {String} Complete HTML email template
 */
async function getFleetManagementTemplate(supabase, companyId) {
    try {
        // Fetch company details
        const { data: company, error: companyError } = await supabase
            .from('companies')
            .select('id, name, email')
            .eq('id', companyId)
            .single();

        if (companyError) throw companyError;

        // Read the template file
        const filePath = path.join(__dirname, 'dailyTemplate.html');
        let template = await fs.readFile(filePath, 'utf-8');

        // Fetch vessel data from Supabase for this company only
        const vesselData = await getFleetData(supabase, companyId);

        // Calculate statistics
        const stats = calculateFleetStats(vesselData);

        // Generate AI suggestions based on fleet data
        const aiSuggestions = await generateAISuggestions(vesselData, stats);

        // Generate vessel data for template
        const vessels = generateVesselsForTemplate(vesselData);

        // Get current date
        const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Prepare template data
        const templateData = {
            company_name: company.name,
            date: currentDate,
            total_vessels: stats.totalVessels,
            total_crew: stats.totalCrew,
            total_requisitions: stats.totalRequisitions,
            avg_inventory: stats.avgInventory,
            generation_date: currentDate,
            required: aiSuggestions, // AI-generated suggestions
            vessels: vessels
        };

        // Render template
        const rendered = renderTemplate(template, templateData);

        return rendered;
    } catch (error) {
        console.error('Error generating fleet management template:', error);
        throw error;
    }
}

/**
 * Sends fleet management email to a specific company
 * @param {Object} supabase - Supabase client instance
 * @param {String} companyId - Company ID
 * @param {Object} transporter - Nodemailer transporter instance
 */
async function sendFleetManagementEmailToCompany(supabase, companyId, transporter) {
    try {
        // Fetch company details
        const { data: company, error: companyError } = await supabase
            .from('companies')
            .select('id, name, email')
            .eq('id', companyId)
            .single();

        if (companyError) throw companyError;

        // Check if email is set
        if (!company.email) {
            console.log(`No email set for company: ${company.name} (ID: ${companyId})`);
            return { success: false, error: 'No email configured for this company' };
        }

        // Generate HTML template with company-specific data
        const htmlTemplate = await getFleetManagementTemplate(supabase, company.id);

        // Mail options
        const mailOptions = {
            from: '"OceanHelm Report" <contact@peppubuild.com>',
            to: company.email,
            subject: `${company.name} Fleet Management Report - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
            html: htmlTemplate
        };

        // Send email
        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent successfully to ${company.name}:`, info.response);
        return { success: true, messageId: info.messageId, company: company.name };
    } catch (error) {
        console.error(`Error sending email to company ${companyId}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * Sends fleet management emails to all companies with configured email addresses
 * @param {Object} supabase - Supabase client instance
 * @param {Object} transporter - Nodemailer transporter instance
 */
async function sendFleetManagementEmailToAllCompanies(supabase, transporter) {
    try {
        // Fetch all companies with email addresses set
        const { data: companies, error } = await supabase
            .from('companies')
            .select('id, name, email')
            .not('email', 'is', null);

        if (error) throw error;

        if (!companies || companies.length === 0) {
            console.log('No companies with email addresses found');
            return { success: true, message: 'No companies to send emails to', results: [] };
        }

        console.log(`Sending emails to ${companies.length} companies...`);

        // Send email to each company
        const results = [];
        for (const company of companies) {
            const result = await sendFleetManagementEmailToCompany(supabase, company.id, transporter);
            results.push({
                companyId: company.id,
                companyName: company.name,
                email: company.email,
                ...result
            });

            // Optional: Add a small delay between emails to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;

        console.log(`Email sending complete: ${successCount} successful, ${failureCount} failed`);

        return {
            success: true,
            totalCompanies: companies.length,
            successCount,
            failureCount,
            results
        };
    } catch (error) {
        console.error('Error sending emails to all companies:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Legacy function - sends fleet management email (deprecated, use sendFleetManagementEmailToCompany instead)
 * @param {Object} supabase - Supabase client instance
 * @param {Object} transporter - Nodemailer transporter instance
 * @param {String} companyId - Company ID (optional, for backward compatibility)
 */
async function sendFleetManagementEmail(supabase, transporter, companyId = null) {
    try {
        // If companyId is provided, use it; otherwise use a default or first company
        let targetCompanyId = companyId;
        let companyName = 'OceanHelm';

        if (!targetCompanyId) {
            // Fetch first company with email as fallback
            const { data: company, error } = await supabase
                .from('companies')
                .select('id, name')
                .not('email', 'is', null)
                .limit(1)
                .single();

            if (error || !company) {
                throw new Error('No company found with email configured');
            }

            targetCompanyId = company.id;
            companyName = company.name;
        }

        // Generate HTML template with AI suggestions
        const htmlTemplate = await getFleetManagementTemplate(supabase, targetCompanyId);

        // Mail options
        const mailOptions = {
            from: '"OceanHelm Report" <contact@peppubuild.com>',
            to: 'bertramokwudili@gmail.com',
            subject: `Fleet Management Report - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
            html: htmlTemplate
        };

        // Send email
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.response);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, error: error.message };
    }
}

// Export functions
module.exports = {
    getFleetManagementTemplate,
    getFleetData,
    calculateFleetStats,
    generateVesselsForTemplate,
    generateAISuggestions,
    sendFleetManagementEmail, // Legacy
    sendFleetManagementEmailToCompany,
    sendFleetManagementEmailToAllCompanies
};

// Example usage:
// const { createClient } = require('@supabase/supabase-js');
// const nodemailer = require('nodemailer');
//
// const supabase = createClient('YOUR_SUPABASE_URL', 'YOUR_SUPABASE_KEY');
//
// const transporter = nodemailer.createTransport({
//     host: 'smtp.gmail.com',
//     port: 587,
//     secure: false,
//     auth: {
//         user: 'your-email@gmail.com',
//         pass: 'your-app-password'
//     }
// });
//
// // Send to a specific company
// sendFleetManagementEmailToCompany(supabase, 'company-uuid-here', transporter);
//
// // Send to all companies with email addresses configured
// sendFleetManagementEmailToAllCompanies(supabase, transporter);

app.listen(3000, () => console.log('Server running on port 3000'));
