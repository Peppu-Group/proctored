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
const fs = require('fs');
const fsSync = require('fs'); // For existsSync only
const { GoogleGenerativeAI } = require("@google/generative-ai");
const csv = require('csv-parser');
const createReadStream = require('fs').createReadStream;
const { createClient } = require('@supabase/supabase-js');
const Papa = require('papaparse');

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

/*
async function getChiakaTemplate() {
    try {
        const filePath = path.join(__dirname, 'chiakaTemplate-save.html');
        let template = await fs.readFile(filePath, 'utf-8');
        return template;
    } catch (error) {
        console.error('Error reading email template:', error);
        throw error;
    }
}

// Email queue and status tracking
let emailQueue = [];
let emailStatus = {
    total: 0,
    sent: 0,
    failed: 0,
    pending: 0,
    logs: []
};

// Rate limiting configuration
const RATE_LIMIT = {
    emailsPerBatch: 10,      // Send 10 emails per batch
    batchDelay: 60000,       // Wait 60 seconds between batches (1 minute)
    emailDelay: 2000         // Wait 2 seconds between individual emails
};
// Logging function
function logEmail(email, status, error = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        email,
        status, // 'sent', 'failed', 'queued'
        error: error ? error.message : null
    };

    emailStatus.logs.push(logEntry);
    console.log(`[${timestamp}] ${email}: ${status}${error ? ` - ${error.message}` : ''}`);

    // Update counters
    if (status === 'sent') emailStatus.sent++;
    if (status === 'failed') emailStatus.failed++;
    emailStatus.pending = emailStatus.total - emailStatus.sent - emailStatus.failed;
}

// Save logs to file
async function saveLogsToFile() {
    try {
        const logData = {
            summary: {
                total: emailStatus.total,
                sent: emailStatus.sent,
                failed: emailStatus.failed,
                pending: emailStatus.pending,
                completedAt: new Date().toISOString()
            },
            logs: emailStatus.logs
        };

        const logFileName = `email-logs-${Date.now()}.json`;
        const logPath = path.join(__dirname, 'logs', logFileName);

        // Ensure logs directory exists
        await fs.mkdir(path.join(__dirname, 'logs'), { recursive: true });
        await fs.writeFile(logPath, JSON.stringify(logData, null, 2));

        console.log(`Logs saved to: ${logPath}`);
        return logPath;
    } catch (error) {
        console.error('Error saving logs:', error);
    }
}

// Read and parse CSV file
async function readEmailsFromCSV(filePath) {
    return new Promise((resolve, reject) => {
        const emails = [];

        createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                // Assuming CSV has an 'email' column
                // Adjust the column name based on your CSV structure
                const email = row.email || row.Email || row.EMAIL || Object.values(row)[0];

                if (email && isValidEmail(email.trim())) {
                    emails.push(email.trim());
                } else {
                    console.warn(`Invalid email found: ${email}`);
                }
            })
            .on('end', () => {
                console.log(`Loaded ${emails.length} valid emails from CSV`);
                resolve(emails);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

// Send individual email with retry logic
async function sendSingleEmail(email, htmlContent, retryCount = 0) {
    const maxRetries = 3;

    const mailOptions = {
        from: '"Chiaka is Sixty" <contact@peppubuild.com>',
        to: email,
        subject: 'Save the Date, Chiaka at 60',
        html: htmlContent
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        logEmail(email, 'sent');
        return { success: true, info };
    } catch (error) {
        if (retryCount < maxRetries) {
            console.log(`Retrying email to ${email} (attempt ${retryCount + 1})`);
            await delay(5000); // Wait 5 seconds before retry
            return sendSingleEmail(email, htmlContent, retryCount + 1);
        } else {
            logEmail(email, 'failed', error);
            return { success: false, error };
        }
    }
}

// Delay utility function
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Email validation
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Process email queue in batches
async function processEmailQueue() {
    if (emailQueue.length === 0) {
        console.log('Email queue is empty');
        return;
    }

    const htmlContent = await getChiakaTemplate();

    console.log(`Starting to process ${emailQueue.length} emails...`);

    // Process emails in batches
    for (let i = 0; i < emailQueue.length; i += RATE_LIMIT.emailsPerBatch) {
        const batch = emailQueue.slice(i, i + RATE_LIMIT.emailsPerBatch);

        console.log(`Processing batch ${Math.floor(i / RATE_LIMIT.emailsPerBatch) + 1}: ${batch.length} emails`);

        // Send emails in current batch with individual delays
        for (const email of batch) {
            await sendSingleEmail(email, htmlContent);

            // Add delay between individual emails (except for the last email in batch)
            if (email !== batch[batch.length - 1]) {
                await delay(RATE_LIMIT.emailDelay);
            }
        }

        // Add delay between batches (except for the last batch)
        if (i + RATE_LIMIT.emailsPerBatch < emailQueue.length) {
            console.log(`Waiting ${RATE_LIMIT.batchDelay / 1000} seconds before next batch...`);
            await delay(RATE_LIMIT.batchDelay);
        }
    }

    console.log('Email processing completed!');
    console.log(`Summary: ${emailStatus.sent} sent, ${emailStatus.failed} failed, ${emailStatus.total} total`);

    // Save logs to file
    await saveLogsToFile();
}

// Main endpoint for bulk email sending
app.get('/chiaka-mail-bulk', async (req, res) => {
    try {
        const filePath = path.join(__dirname, 'email.csv');

        // Check if file exists


        // Read emails from CSV
        const emails = await readEmailsFromCSV(filePath);

        if (emails.length === 0) {
            return res.status(400).json({
                error: 'No valid emails found in CSV file'
            });
        }

        // Initialize queue and status
        emailQueue = [...emails]; // Create a copy
        emailStatus = {
            total: emails.length,
            sent: 0,
            failed: 0,
            pending: emails.length,
            logs: [],
            startedAt: new Date().toISOString()
        };

        // Log all emails as queued initially
        emails.forEach(email => logEmail(email, 'queued'));

        // Start processing queue (don't await - let it run in background)
        processEmailQueue().catch(console.error);

        res.json({
            message: 'Bulk email sending initiated',
            totalEmails: emails.length,
            estimatedDuration: Math.ceil(emails.length / RATE_LIMIT.emailsPerBatch) * (RATE_LIMIT.batchDelay / 60000),
            statusEndpoint: '/chiaka-mail-status'
        });

    } catch (error) {
        console.error('Error in bulk email process:', error);
        res.status(500).json({
            error: 'Failed to process bulk emails',
            details: error.message
        });
    }
});
*/
/*
// Send individual email with retry logic
async function sendSingleEmail(email, htmlContent, retryCount = 0) {
    const maxRetries = 3;

    const mailOptions = {
        from: '"Chiaka is Sixty" <contact@peppubuild.com>',
        to: email,
        subject: 'Invitation to Celebrate Chiaka Ben-Obi @ 60',
        html: htmlContent
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        logEmail(email, 'sent');
        return { success: true, info };
    } catch (error) {
        if (retryCount < maxRetries) {
            console.log(`Retrying email to ${email} (attempt ${retryCount + 1})`);
            await delay(5000); // Wait 5 seconds before retry
            return sendSingleEmail(email, htmlContent, retryCount + 1);
        } else {
            logEmail(email, 'failed', error);
            return { success: false, error };
        }
    }
}

// Delay utility function
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getChiakaTemplate(link) {
    try {
        const filePath = path.join(__dirname, 'chiakaTemplate.html');
        let template = await fs.readFile(filePath, 'utf-8');
        template = template.replace('{{rsvpLink}}', link);
        return template;
    } catch (error) {
        console.error('Error reading email template:', error);
        throw error;
    }
}

// Email queue and status tracking
let emailQueue = [];
let emailStatus = {
    total: 0,
    sent: 0,
    failed: 0,
    pending: 0,
    logs: []
};

// Rate limiting configuration
const RATE_LIMIT = {
    emailsPerBatch: 10,      // Send 10 emails per batch
    batchDelay: 60000,       // Wait 60 seconds between batches (1 minute)
    emailDelay: 2000         // Wait 2 seconds between individual emails
};

// Logging function
function logEmail(email, status, error = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        email,
        status, // 'sent', 'failed', 'queued'
        error: error ? error.message : null
    };

    emailStatus.logs.push(logEntry);
    console.log(`[${timestamp}] ${email}: ${status}${error ? ` - ${error.message}` : ''}`);

    // Update counters
    if (status === 'sent') emailStatus.sent++;
    if (status === 'failed') emailStatus.failed++;
    emailStatus.pending = emailStatus.total - emailStatus.sent - emailStatus.failed;
}

// Save logs to file
async function saveLogsToFile() {
    try {
        const logData = {
            summary: {
                total: emailStatus.total,
                sent: emailStatus.sent,
                failed: emailStatus.failed,
                pending: emailStatus.pending,
                completedAt: new Date().toISOString()
            },
            logs: emailStatus.logs
        };

        const logFileName = `email-logs-${Date.now()}.json`;
        const logPath = path.join(__dirname, 'logs', logFileName);

        // Ensure logs directory exists
        await fs.mkdir(path.join(__dirname, 'logs'), { recursive: true });
        await fs.writeFile(logPath, JSON.stringify(logData, null, 2));

        console.log(`Logs saved to: ${logPath}`);
        return logPath;
    } catch (error) {
        console.error('Error saving logs:', error);
    }
}

// Read and parse CSV file
async function readEmailsFromCSV(filePath) {
    return new Promise((resolve, reject) => {
        const emailData = [];

        createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                // Extract email and link from CSV columns
                // Adjust column names based on your CSV structure
                const email = row.email || row.Email || row.EMAIL;
                const link = row.link || row.Link || row.LINK || row.url || row.URL;

                if (email && isValidEmail(email.trim())) {
                    emailData.push({
                        email: email.trim(),
                        link: link ? link.trim() : null
                    });
                } else {
                    console.warn(`Invalid email found: ${email}`);
                }
            })
            .on('end', () => {
                console.log(`Loaded ${emailData.length} valid email entries from CSV`);
                resolve(emailData);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

// Email validation
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Delay utility function
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Process email queue in batches
async function processEmailQueue() {
    if (emailQueue.length === 0) {
        console.log('Email queue is empty');
        return;
    }

    console.log(`Starting to process ${emailQueue.length} emails...`);

    // Process emails in batches
    for (let i = 0; i < emailQueue.length; i += RATE_LIMIT.emailsPerBatch) {
        const batch = emailQueue.slice(i, i + RATE_LIMIT.emailsPerBatch);

        console.log(`Processing batch ${Math.floor(i / RATE_LIMIT.emailsPerBatch) + 1}: ${batch.length} emails`);

        // Send emails in current batch with individual delays
        for (const { email, link } of batch) {
            // Get template with the specific link for this email
            const htmlContent = await getChiakaTemplate(link);
            
            await sendSingleEmail(email, htmlContent);

            // Add delay between individual emails (except for the last email in batch)
            if (email !== batch[batch.length - 1].email) {
                await delay(RATE_LIMIT.emailDelay);
            }
        }

        // Add delay between batches (except for the last batch)
        if (i + RATE_LIMIT.emailsPerBatch < emailQueue.length) {
            console.log(`Waiting ${RATE_LIMIT.batchDelay / 1000} seconds before next batch...`);
            await delay(RATE_LIMIT.batchDelay);
        }
    }

    console.log('Email processing completed!');
    console.log(`Summary: ${emailStatus.sent} sent, ${emailStatus.failed} failed, ${emailStatus.total} total`);

    // Save logs to file
    await saveLogsToFile();
}

// Main endpoint for bulk email sending
app.get('/chiaka-mail-bulk', async (req, res) => {
    try {
        const filePath = path.join(__dirname, 'email.csv');

        // Check if file exists - use fsSync for this synchronous check
        if (!fsSync.existsSync(filePath)) {
            return res.status(404).json({
                error: 'CSV file not found',
                path: filePath
            });
        }

        // Read emails and links from CSV
        const emailData = await readEmailsFromCSV(filePath);

        if (emailData.length === 0) {
            return res.status(400).json({
                error: 'No valid emails found in CSV file'
            });
        }

        // Initialize queue and status
        emailQueue = [...emailData]; // Store array of {email, link} objects
        emailStatus = {
            total: emailData.length,
            sent: 0,
            failed: 0,
            pending: emailData.length,
            logs: [],
            startedAt: new Date().toISOString()
        };

        // Log all emails as queued initially
        emailData.forEach(({ email }) => logEmail(email, 'queued'));

        // Start processing queue (don't await - let it run in background)
        processEmailQueue().catch(console.error);

        res.json({
            message: 'Bulk email sending initiated',
            totalEmails: emailData.length,
            estimatedDuration: Math.ceil(emailData.length / RATE_LIMIT.emailsPerBatch) * (RATE_LIMIT.batchDelay / 60000),
            statusEndpoint: '/chiaka-mail-status'
        });

    } catch (error) {
        console.error('Error in bulk email process:', error);
        res.status(500).json({
            error: 'Failed to process bulk emails',
            details: error.message
        });
    }
});

// Status endpoint to check progress
app.get('/chiaka-mail-status', (req, res) => {
    const progress = emailStatus.total > 0 ?
        Math.round((emailStatus.sent + emailStatus.failed) / emailStatus.total * 100) : 0;

    res.json({
        ...emailStatus,
        progress: `${progress}%`,
        isComplete: emailStatus.pending === 0
    });
});

// Endpoint to get detailed logs
app.get('/chiaka-mail-logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const paginatedLogs = emailStatus.logs.slice(offset, offset + limit);

    res.json({
        total: emailStatus.logs.length,
        limit,
        offset,
        logs: paginatedLogs
    });
});

// Keep your original single email endpoint for testing
app.get('/chiaka-mail-single', async (req, res) => {
    const email = 'eventlord20@gmail.com'; // 'bertramokwudili@gmail.com'; // chiakais60@gmail.com // eventlord20@gmail.com

    if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: 'Valid email parameter required' });
    }

    const htmlContent = await getChiakaTemplate();

    const mailOptions = {
        from: '"Chiaka Is Sixty" <chiaka-is-sixty@peppubuild.com>',
        to: email,
        subject: 'Send Tribute, Chiaka at 60',
        html: htmlContent
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            res.status(500).json({ error: error.message });
        } else {
            res.json({ message: 'Email sent successfully', response: info.response });
        }
    });
});
*/

const token = process.env.WHATSAPP_TOKEN; // your permanent access token
const phoneNumberId = process.env.PHONE_NUMBER_ID; // your verified number ID

// Logging arrays to track message status
const successLog = [];
const failureLog = [];

// Read and parse CSV file
function readCSVFile(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];

        if (!fs.existsSync(filePath)) {
            reject(new Error(`CSV file not found: ${filePath}`));
            return;
        }

        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => {
                // Trim whitespace from all values
                const cleanData = {};
                Object.keys(data).forEach(key => {
                    const cleanKey = key.trim();
                    cleanData[cleanKey] = data[key] ? data[key].toString().trim() : '';
                });

                results.push(cleanData);
            })
            .on('end', () => {
                console.log(`Successfully parsed ${results.length} rows from CSV`);
                resolve(results);
            })
            .on('error', (error) => {
                reject(new Error(`Error reading CSV file: ${error.message}`));
            });
    });
}

// Send WhatsApp message to individual recipient
async function sendWhatsAppMessage(recipient) {
    const { name, phone, id } = recipient;

    // Ensure phone number is in international format
    const formattedPhone = phone;

    // Extract last 5 digits from the phone number
   //  const last5Digits = phone.toString().slice(-8);
    // console.log(last5Digits)

    try {
        const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: formattedPhone,
                type: "template",
                template: {
                    name: 'chiaka_new_appreciation',  // Your approved template name
                    language: { code: 'en_US' },
                    components: [
                        {
                            type: "body",
                            parameters: [
                                {
                                    type: "text",
                                    text: `Chiaka's 60th Birthday`  // First variant: name from CSV
                                },
                                {
                                    type: "text",
                                    text: `Celebrating me`  // First variant: name from CSV
                                },
                                {
                                    type: "text",
                                    text: `Future events`  // First variant: name from CSV
                                },
                                {
                                    type: "text",
                                    text: `my`  // First variant: name from CSV
                                },
                            ]
                        }
                    ]
                }
            })
        });

        const data = await response.json();

        if (response.ok && data.messages && data.messages[0].id) {
            // Success
            const logEntry = {
                name,
                phone: formattedPhone,
                id,
                id,
                status: 'SUCCESS',
                messageId: data.messages[0].id,
                timestamp: new Date().toISOString()
            };
            successLog.push(logEntry);
            console.log(`✅ Message sent successfully to ${name} (${formattedPhone})`);
            return { success: true, data: logEntry };
        } else {
            // API returned error
            throw new Error(data.error?.message || 'Unknown API error');
        }

    } catch (error) {
        // Failure
        const logEntry = {
            name,
            phone: formattedPhone,
            id,
            id,
            status: 'FAILED',
            error: error.message,
            timestamp: new Date().toISOString()
        };
        failureLog.push(logEntry);
        console.log(`❌ Failed to send message to ${name} (${formattedPhone}): ${error.message}`);
        return { success: false, data: logEntry };
    }
}


// Add delay between requests to avoid rate limiting
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Send bulk messages
async function sendBulkMessages(csvFilePath, delayMs = 1000) {
    console.log('Starting bulk WhatsApp message sending...');
    console.log(`Reading CSV file: ${csvFilePath}`);

    try {
        const recipients = await readCSVFile(csvFilePath);

        if (recipients.length === 0) {
            console.log('No recipients found in CSV file.');
            return;
        }

        console.log(`Found ${recipients.length} recipients`);

        // Validate required fields
        const validRecipients = recipients.filter(recipient => {
            const hasRequiredFields = recipient.name && recipient.phone;
            if (!hasRequiredFields) {
                console.warn(`⚠️ Skipping recipient with missing fields:`, recipient);
            }
            return hasRequiredFields;
        });

        console.log(`Processing ${validRecipients.length} valid recipients...\n`);

        // Send messages with delay
        for (let i = 0; i < validRecipients.length; i++) {
            const recipient = validRecipients[i];
            console.log(`Processing ${i + 1}/${validRecipients.length}: ${recipient.name}`);

            await sendWhatsAppMessage(recipient);

            // Add delay between requests (except for the last one)
            if (i < validRecipients.length - 1) {
                await delay(delayMs);
            }
        }

        // Generate and save logs
        await generateLogs();

        // Print summary
        printSummary();

    } catch (error) {
        console.error('Error processing CSV file:', error.message);
    }
}

// Generate log files
async function generateLogs() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    try {
        // Success log
        if (successLog.length > 0) {
            const successCsv = Papa.unparse(successLog);
            const successFileName = `whatsapp_success_log_${timestamp}.csv`;
            fs.writeFileSync(successFileName, successCsv);
            console.log(`\n📄 Success log saved: ${successFileName}`);
        }

        // Failure log
        if (failureLog.length > 0) {
            const failureCsv = Papa.unparse(failureLog);
            const failureFileName = `whatsapp_failure_log_${timestamp}.csv`;
            fs.writeFileSync(failureFileName, failureCsv);
            console.log(`📄 Failure log saved: ${failureFileName}`);
        }

        // Combined log
        const combinedLog = [...successLog, ...failureLog];
        if (combinedLog.length > 0) {
            const combinedCsv = Papa.unparse(combinedLog);
            const combinedFileName = `whatsapp_combined_log_${timestamp}.csv`;
            fs.writeFileSync(combinedFileName, combinedCsv);
            console.log(`📄 Combined log saved: ${combinedFileName}`);
        }

    } catch (error) {
        console.error('Error saving log files:', error.message);
    }
}

// Print summary statistics
function printSummary() {
    const total = successLog.length + failureLog.length;
    const successRate = total > 0 ? ((successLog.length / total) * 100).toFixed(2) : 0;

    console.log('\n' + '='.repeat(50));
    console.log('📊 BULK MESSAGE SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total messages processed: ${total}`);
    console.log(`✅ Successful: ${successLog.length}`);
    console.log(`❌ Failed: ${failureLog.length}`);
    console.log(`📈 Success rate: ${successRate}%`);
    console.log('='.repeat(50));

    if (failureLog.length > 0) {
        console.log('\n❌ Failed Recipients:');
        failureLog.forEach(entry => {
            console.log(`  - ${entry.name} (${entry.phone}): ${entry.error}`);
        });
    }
}

// Main execution
async function main() {
    // Check required environment variables
    if (!token || !phoneNumberId) {
        console.error('❌ Missing required environment variables:');
        console.error('  - WHATSAPP_TOKEN');
        console.error('  - PHONE_NUMBER_ID');
        process.exit(1);
    }

    // Get CSV file path from command line arguments or use default
    const csvFilePath = process.argv[2] || 'passcode.csv';

    // Optional delay between messages (default 1 second)
    const delayMs = parseInt(process.argv[3]) || 1000;

    console.log(`Using CSV file: ${csvFilePath}`);
    console.log(`Delay between messages: ${delayMs}ms\n`);

    await sendBulkMessages(csvFilePath, delayMs);
}

main();
/*
// Save the date for EBUBEDIKE
const token = process.env.WHATSAPP_TOKEN; // your permanent access token
const phoneNumberId = process.env.PHONE_NUMBER_ID; // your verified number ID

// Logging arrays to track message status
const successLog = [];
const failureLog = [];

// Read and parse CSV file
function readCSVFile(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];

        if (!fs.existsSync(filePath)) {
            reject(new Error(`CSV file not found: ${filePath}`));
            return;
        }

        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => {
                // Trim whitespace from all values
                const cleanData = {};
                Object.keys(data).forEach(key => {
                    const cleanKey = key.trim();
                    cleanData[cleanKey] = data[key] ? data[key].toString().trim() : '';
                });

                results.push(cleanData);
            })
            .on('end', () => {
                console.log(`Successfully parsed ${results.length} rows from CSV`);
                resolve(results);
            })
            .on('error', (error) => {
                reject(new Error(`Error reading CSV file: ${error.message}`));
            });
    });
}

// Send WhatsApp message to individual recipient

async function sendWhatsAppMessage(recipient) {
    const { name, phone, id } = recipient;

    // Ensure phone number is in international format
    const formattedPhone = phone;

    // Extract last 5 digits from the phone number
    const last5Digits = phone.toString().slice(-9);

    try {
        const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: formattedPhone,
                type: "template",
                template: {
                    name: 'ebubedike_rsvp',  // Your approved template name
                    language: { code: 'en_US' },
                    components: [
                        {
                            type: "body",
                            parameters: [
                                {
                                    type: "text",
                                    text: name  // First variant: name from CSV
                                },
                                {
                                    type: "text",
                                    text: last5Digits  // First variant: name from CSV
                                }
                            ]
                        },
                    ]
                }
            })
        });

        const data = await response.json();

        if (response.ok && data.messages && data.messages[0].id) {
            // Success
            const logEntry = {
                name,
                phone: formattedPhone,
                id,
                last5Digits,
                status: 'SUCCESS',
                messageId: data.messages[0].id,
                timestamp: new Date().toISOString()
            };
            successLog.push(logEntry);
            console.log(`✅ Message sent successfully to ${name} (${formattedPhone}) with code: ${last5Digits}`);
            return { success: true, data: logEntry };
        } else {
            // API returned error
            throw new Error(data.error?.message || 'Unknown API error');
        }

    } catch (error) {
        // Failure
        const logEntry = {
            name,
            phone: formattedPhone,
            id,
            last5Digits,
            status: 'FAILED',
            error: error.message,
            timestamp: new Date().toISOString()
        };
        failureLog.push(logEntry);
        console.log(`❌ Failed to send message to ${name} (${formattedPhone}): ${error.message}`);
        return { success: false, data: logEntry };
    }
}


// Add delay between requests to avoid rate limiting
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Send bulk messages
async function sendBulkMessages(csvFilePath, delayMs = 1000) {
    console.log('Starting bulk WhatsApp message sending...');
    console.log(`Reading CSV file: ${csvFilePath}`);

    try {
        const recipients = await readCSVFile(csvFilePath);

        if (recipients.length === 0) {
            console.log('No recipients found in CSV file.');
            return;
        }

        console.log(`Found ${recipients.length} recipients`);

        // Validate required fields
        const validRecipients = recipients.filter(recipient => {
            const hasRequiredFields = recipient.name && recipient.phone;
            if (!hasRequiredFields) {
                console.warn(`⚠️ Skipping recipient with missing fields:`, recipient);
            }
            return hasRequiredFields;
        });

        console.log(`Processing ${validRecipients.length} valid recipients...\n`);

        // Send messages with delay
        for (let i = 0; i < validRecipients.length; i++) {
            const recipient = validRecipients[i];
            console.log(`Processing ${i + 1}/${validRecipients.length}: ${recipient.name}`);

            await sendWhatsAppMessage(recipient);

            // Add delay between requests (except for the last one)
            if (i < validRecipients.length - 1) {
                await delay(delayMs);
            }
        }

        // Generate and save logs
        await generateLogs();

        // Print summary
        printSummary();

    } catch (error) {
        console.error('Error processing CSV file:', error.message);
    }
}

// Generate log files
async function generateLogs() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    try {
        // Success log
        if (successLog.length > 0) {
            const successCsv = Papa.unparse(successLog);
            const successFileName = `whatsapp_success_log_${timestamp}.csv`;
            fs.writeFileSync(successFileName, successCsv);
            console.log(`\n📄 Success log saved: ${successFileName}`);
        }

        // Failure log
        if (failureLog.length > 0) {
            const failureCsv = Papa.unparse(failureLog);
            const failureFileName = `whatsapp_failure_log_${timestamp}.csv`;
            fs.writeFileSync(failureFileName, failureCsv);
            console.log(`📄 Failure log saved: ${failureFileName}`);
        }

        // Combined log
        const combinedLog = [...successLog, ...failureLog];
        if (combinedLog.length > 0) {
            const combinedCsv = Papa.unparse(combinedLog);
            const combinedFileName = `whatsapp_combined_log_${timestamp}.csv`;
            fs.writeFileSync(combinedFileName, combinedCsv);
            console.log(`📄 Combined log saved: ${combinedFileName}`);
        }

    } catch (error) {
        console.error('Error saving log files:', error.message);
    }
}

// Print summary statistics
function printSummary() {
    const total = successLog.length + failureLog.length;
    const successRate = total > 0 ? ((successLog.length / total) * 100).toFixed(2) : 0;

    console.log('\n' + '='.repeat(50));
    console.log('📊 BULK MESSAGE SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total messages processed: ${total}`);
    console.log(`✅ Successful: ${successLog.length}`);
    console.log(`❌ Failed: ${failureLog.length}`);
    console.log(`📈 Success rate: ${successRate}%`);
    console.log('='.repeat(50));

    if (failureLog.length > 0) {
        console.log('\n❌ Failed Recipients:');
        failureLog.forEach(entry => {
            console.log(`  - ${entry.name} (${entry.phone}): ${entry.error}`);
        });
    }
}

// Main execution
async function main() {
    // Check required environment variables
    if (!token || !phoneNumberId) {
        console.error('❌ Missing required environment variables:');
        console.error('  - WHATSAPP_TOKEN');
        console.error('  - PHONE_NUMBER_ID');
        process.exit(1);
    }

    // Get CSV file path from command line arguments or use default
    const csvFilePath = process.argv[2] || 'passcode.csv';

    // Optional delay between messages (default 1 second)
    const delayMs = parseInt(process.argv[3]) || 1000;

    console.log(`Using CSV file: ${csvFilePath}`);
    console.log(`Delay between messages: ${delayMs}ms\n`);

    await sendBulkMessages(csvFilePath, delayMs);
}

main();
*/

// WhatsApp API Configuration
const WHATSAPP_CONFIG = {
    accessToken: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.PHONE_NUMBER_ID,
    apiVersion: 'v21.0',
    baseURL: 'https://graph.facebook.com'
};

 // Rate limiting configuration (Meta's limits: 1000 messages per second, but we'll be conservative)
 /*
const RATE_LIMIT = {
    messagesPerBatch: 10,      // Send 10 messages per batch
    batchDelay: 60000,         // Wait 60 seconds between batches
    messageDelay: 3000,        // Wait 3 seconds between individual messages
    maxRetries: 3              // Maximum retry attempts
};  */


// Message queue and status tracking
let messageQueue = [];
let messageStatus = {
    total: 0,
    sent: 0,
    failed: 0,
    pending: 0,
    logs: [],
    startedAt: null,
    completedAt: null
};

// Template configuration - Using your exact template with image header
const MESSAGE_TEMPLATE = {
    name: 'send_feedback',  // Your approved template name
    language: { code: 'en' },
    /*
    components: [
        {
          type: "header",
          parameters: [
            {
              type: "image",
              image: {
                link: "https://github.com/user-attachments/assets/03f75572-cab8-4f62-aff5-89ae07b8c346" // must be a valid public HTTPS image
              }
            }
          ]
        }
      ]
      */
};

// Logging function
function logMessage(phoneNumber, status, error = null, messageId = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        phoneNumber,
        status, // 'sent', 'failed', 'queued', 'delivered', 'read'
        messageId,
        error: error ? error.message || error : null
    };
    
    messageStatus.logs.push(logEntry);
    console.log(`[${timestamp}] ${phoneNumber}: ${status}${error ? ` - ${error.message || error}` : ''}${messageId ? ` (ID: ${messageId})` : ''}`);
    
    // Update counters
    if (status === 'sent') messageStatus.sent++;
    if (status === 'failed') messageStatus.failed++;
    messageStatus.pending = messageStatus.total - messageStatus.sent - messageStatus.failed;
}

// Save logs to file
async function saveLogsToFile() {
    try {
        const logData = {
            summary: {
                total: messageStatus.total,
                sent: messageStatus.sent,
                failed: messageStatus.failed,
                pending: messageStatus.pending,
                startedAt: messageStatus.startedAt,
                completedAt: new Date().toISOString(),
                duration: messageStatus.startedAt ? 
                    Math.round((new Date() - new Date(messageStatus.startedAt)) / 1000) : 0
            },
            logs: messageStatus.logs,
            config: {
                template: MESSAGE_TEMPLATE.name,
                rateLimit: RATE_LIMIT
            }
        };
        
        const logFileName = `whatsapp-logs-${Date.now()}.json`;
        const logPath = path.join(__dirname, 'logs', logFileName);
        
        // Ensure logs directory exists
        await fs.mkdir(path.join(__dirname, 'logs'), { recursive: true });
        await fs.writeFile(logPath, JSON.stringify(logData, null, 2));
        
        console.log(`Logs saved to: ${logPath}`);
        return logPath;
    } catch (error) {
        console.error('Error saving logs:', error);
    }
}

// Phone number validation and formatting
function formatPhoneNumber(phone) {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Add country code if missing (assuming Nigeria +234)
    if (cleaned.length === 10 && cleaned.startsWith('0')) {
        cleaned = '234' + cleaned.substring(1);
    } else if (cleaned.length === 11 && cleaned.startsWith('234')) {
        // Already has country code
    } else if (cleaned.length === 13 && cleaned.startsWith('234')) {
        // Already properly formatted
    } else {
        // Try to handle other formats
        if (!cleaned.startsWith('234') && cleaned.length >= 10) {
            cleaned = '234' + cleaned.substring(cleaned.length - 10);
        }
    }
    
    return cleaned;
}

function isValidPhoneNumber(phone) {
    const formatted = phone;
    // Nigerian numbers should be 13 digits starting with 234
    console.log(formatted)
    return formatted;
}

// Read and parse CSV file
async function readPhoneNumbersFromCSV(filePath) {
    return new Promise((resolve, reject) => {
        const phoneNumbers = [];
        
        createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                // Try different possible column names for phone numbers
                const phone = row.phone || row.Phone || row.PHONE || 
                            row.phoneNumber || row.PhoneNumber || row.mobile || 
                            row.Mobile || row.whatsapp || row.WhatsApp || 
                            Object.values(row)[0];
                
                if (phone) {
                    const formatted = phone.toString().trim();
                    phoneNumbers.push(formatted);

                }
            })
            .on('end', () => {
                console.log(`Loaded ${phoneNumbers.length} valid phone numbers from CSV`);
                resolve([...new Set(phoneNumbers)]); // Remove duplicates
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

/*
// Send individual WhatsApp message
async function sendWhatsAppMessage(phoneNumber, retryCount = 0) {
    try {
        const payload = {
            messaging_product: 'whatsapp',
            to: phoneNumber,
            type: 'template',
            template: MESSAGE_TEMPLATE
        };

        const response = await fetch(
            `${WHATSAPP_CONFIG.baseURL}/${WHATSAPP_CONFIG.apiVersion}/${WHATSAPP_CONFIG.phoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_CONFIG.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            }
        );

        const data = await response.json();

        if (response.ok && data.messages && data.messages[0]) {
            const messageId = data.messages[0].id;
            logMessage(phoneNumber, 'sent', null, messageId);
            return { success: true, messageId, data };
        } else {
            throw new Error(data.error?.message || `HTTP ${response.status}: ${response.statusText}`);
        }

    } catch (error) {
        console.error(`Error sending to ${phoneNumber}:`, error.message);
        
        // Handle specific WhatsApp API errors
        if (error.message.includes('429') || error.message.includes('rate limit')) {
            // Rate limited - wait longer and retry
            if (retryCount < RATE_LIMIT.maxRetries) {
                console.log(`Rate limited for ${phoneNumber}, waiting 2 minutes before retry...`);
                await delay(120000); // Wait 2 minutes
                return sendWhatsAppMessage(phoneNumber, retryCount + 1);
            }
        } else if (error.message.includes('5') && retryCount < RATE_LIMIT.maxRetries) {
            // Server error - retry with exponential backoff
            const backoffDelay = Math.pow(2, retryCount) * 5000; // 5s, 10s, 20s
            console.log(`Server error for ${phoneNumber}, retrying in ${backoffDelay/1000}s...`);
            await delay(backoffDelay);
            return sendWhatsAppMessage(phoneNumber, retryCount + 1);
        }

        const errorMsg = error.message;
        logMessage(phoneNumber, 'failed', errorMsg);
        return { success: false, error: errorMsg };
    }
}
*/
// Delay utility function
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Process message queue in batches
async function processMessageQueue() {
    if (messageQueue.length === 0) {
        console.log('Message queue is empty');
        return;
    }

    console.log(`Starting to process ${messageQueue.length} WhatsApp messages...`);
    messageStatus.startedAt = new Date().toISOString();
    
    // Process messages in batches
    for (let i = 0; i < messageQueue.length; i += RATE_LIMIT.messagesPerBatch) {
        const batch = messageQueue.slice(i, i + RATE_LIMIT.messagesPerBatch);
        const batchNumber = Math.floor(i / RATE_LIMIT.messagesPerBatch) + 1;
        const totalBatches = Math.ceil(messageQueue.length / RATE_LIMIT.messagesPerBatch);
        
        console.log(`Processing batch ${batchNumber}/${totalBatches}: ${batch.length} messages`);
        
        // Send messages in current batch with individual delays
        for (const phoneNumber of batch) {
            await sendWhatsAppMessage(phoneNumber);
            
            // Add delay between individual messages (except for the last message in batch)
            if (phoneNumber !== batch[batch.length - 1]) {
                await delay(RATE_LIMIT.messageDelay);
            }
        }
        
        // Add delay between batches (except for the last batch)
        if (i + RATE_LIMIT.messagesPerBatch < messageQueue.length) {
            console.log(`Batch ${batchNumber} completed. Waiting ${RATE_LIMIT.batchDelay / 1000} seconds before next batch...`);
            await delay(RATE_LIMIT.batchDelay);
        }
    }
    
    messageStatus.completedAt = new Date().toISOString();
    console.log('WhatsApp message processing completed!');
    console.log(`Summary: ${messageStatus.sent} sent, ${messageStatus.failed} failed, ${messageStatus.total} total`);
    
    // Save logs to file
    await saveLogsToFile();
}

// Main endpoint for bulk WhatsApp messaging
app.get('/whatsapp-bulk', async (req, res) => {
    try {
        // Validate configuration
        if (!WHATSAPP_CONFIG.accessToken || !WHATSAPP_CONFIG.phoneNumberId) {
            return res.status(400).json({
                error: 'WhatsApp configuration missing. Please set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in your .env file'
            });
        }

        const filePath = path.join(__dirname, 'phoneNumbers.csv');
        
        // Check if file exists
        try {
            await fs.access(filePath);
        } catch (error) {
            return res.status(404).json({ 
                error: 'CSV file not found', 
                path: filePath,
                hint: 'Please ensure phoneNumbers.csv exists in your project root'
            });
        }
        
        // Read phone numbers from CSV
        const phoneNumbers = await readPhoneNumbersFromCSV(filePath);
        
        if (phoneNumbers.length === 0) {
            return res.status(400).json({ 
                error: 'No valid phone numbers found in CSV file',
                hint: 'Ensure your CSV has a column named "phone", "phoneNumber", or "mobile"'
            });
        }
        
        // Initialize queue and status
        messageQueue = [...phoneNumbers];
        messageStatus = {
            total: phoneNumbers.length,
            sent: 0,
            failed: 0,
            pending: phoneNumbers.length,
            logs: [],
            startedAt: null,
            completedAt: null
        };
        
        // Log all numbers as queued initially
        phoneNumbers.forEach(phone => logMessage(phone, 'queued'));
        
        // Start processing queue (don't await - let it run in background)
        processMessageQueue().catch(console.error);
        
        const estimatedDuration = Math.ceil(phoneNumbers.length / RATE_LIMIT.messagesPerBatch) * 
                                (RATE_LIMIT.batchDelay / 60000);
        
        res.json({
            message: 'Bulk WhatsApp messaging initiated',
            totalNumbers: phoneNumbers.length,
            template: MESSAGE_TEMPLATE.name,
            estimatedDuration: `${estimatedDuration} minutes`,
            statusEndpoint: '/whatsapp-status'
        });
        
    } catch (error) {
        console.error('Error in bulk WhatsApp process:', error);
        res.status(500).json({ 
            error: 'Failed to process bulk WhatsApp messages', 
            details: error.message 
        });
    }
});

// Status endpoint to check progress
app.get('/whatsapp-status', (req, res) => {
    const progress = messageStatus.total > 0 ? 
        Math.round((messageStatus.sent + messageStatus.failed) / messageStatus.total * 100) : 0;
    
    const duration = messageStatus.startedAt ? 
        Math.round((new Date() - new Date(messageStatus.startedAt)) / 1000) : 0;
    
    res.json({
        ...messageStatus,
        progress: `${progress}%`,
        isComplete: messageStatus.pending === 0,
        durationSeconds: duration
    });
});

// Endpoint to get detailed logs
app.get('/whatsapp-logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status; // Filter by status: 'sent', 'failed', 'queued'
    
    let filteredLogs = messageStatus.logs;
    if (status) {
        filteredLogs = messageStatus.logs.filter(log => log.status === status);
    }
    
    const paginatedLogs = filteredLogs.slice(offset, offset + limit);
    
    res.json({
        total: filteredLogs.length,
        limit,
        offset,
        logs: paginatedLogs
    });
});

// Test endpoint for single message
app.get('/whatsapp-test', async (req, res) => {
    const phoneNumber  = '2348032004501';
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'phoneNumber is required' });
    }
    
    const formatted = formatPhoneNumber(phoneNumber);
    
    try {
        const result = await sendWhatsAppMessage(formatted);
        res.json({
            success: result.success,
            phoneNumber: formatted,
            messageId: result.messageId,
            error: result.error
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to send test message',
            details: error.message 
        });
    }
});

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

async function getCertReminderTemplate(vesselName, certName) {
    try {
        const filePath = path.join(__dirname, 'certReminderTemplate.html');
        let template = await fs.readFile(filePath, 'utf-8');

        // Replace placeholders with actual data
        template = template.replace('{{certName}}', certName);
        template = template.replace('{{vesselName}}', vesselName);
        template = template.replace('{{deadLine}}', '1 Day');

        return template;
    } catch (error) {
        console.error('Error reading email template:', error);
        throw error;
    }
}

async function getMaintenanceTemplate(vessel, component, assigned_to) {
    try {
        const filePath = path.join(__dirname, 'certReminderTemplate.html');
        let template = await fs.readFile(filePath, 'utf-8');

        // Replace placeholders with actual data
        template = template.replace('{{certName}}', `${component}, Assigned To: ${assigned_to}`);
        template = template.replace('{{vesselName}}', vessel);
        template = template.replace('{{deadLine}}', '1 Day');

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
async function getItemsExpiringWeek() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 7);
    const tomorrowStr = tomorrow.toISOString().split('T')[0]; // Format: YYYY-MM-DD

    try {
        const { data, error } = await supabase
            .from('vessels')
            .select('*')
            .filter('certifications', 'cs', `[{"expiry_date": "${tomorrowStr}"}]`);

        if (error) {
            console.error('Error fetching expiring items:', error);
            return [];
        }

        // Step 2: Extract only the certifications that actually expire tomorrow
        const expiringCerts = [];
        (data || []).forEach(vessel => {
            (vessel.certifications || []).forEach(cert => {
                if (cert.expiry_date === tomorrowStr) {
                    expiringCerts.push({
                        vesselName: vessel.name,
                        certName: cert.name,
                        email: cert.email // email is inside each certification
                    });
                }
            });
        });

        return expiringCerts;
    } catch (error) {
        console.error('Database query failed:', error);
        return [];
    }
}

async function getItemsExpiringTomorrow() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD

    try {
        const { data, error: supabaseError } = await supabase
            .from('tasks')
            .select('component, vessel, assigned_to, email')
            .eq('next_due', tomorrowStr);

        if (supabaseError) {
            console.error('Error fetching expiring items:', supabaseError);
            return [];
        }

        return data ?? []; // always return array

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
        // console.log(res)
        // sendReminderMails(data)
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


app.post('/notification', (req, res) => {
    const notificationData = req.body;
    // Send the email
    sendNotificationMails(notificationData);

    res.status(200).json({ message: 'Email sent successfully' });
});

async function sendReminderMails(data) {
    try {
        const htmlContent = await getCertReminderTemplate(data.vesselName, data.certName)

        const mailOptions = {
            from: '"Reminder from OceanHelm" <users@peppubuild.com>',
            to: data.email,
            subject: `You have an Important Reminder from OceanHelm`,
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
}

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
            data.assigned_to // fixed variable
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


app.listen(3000, () => console.log('Server running on port 3000'));
