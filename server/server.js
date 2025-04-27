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
const paystack = require('./paystack');
const crypto = require('crypto');

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

const SECRET_KEY = process.env.SECRET_KEY;
const serviceAccountEmail = 'proctor-peppubuild@proctor-peppubuild.iam.gserviceaccount.com'; // Replace with your service account email


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
        scope: 'openid profile email drive.file',
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
    const transporter = nodemailer.createTransport({
        host: process.env.HOST,
        port: 465, // Use 587 for TLS/STARTTLS
        secure: true, // true for port 465 (SSL), false for port 587 (TLS)
        auth: {
            user: 'users@peppubuild.com', // Your Namecheap Private Email address
            pass: process.env.PASSWORD // Your email account password
        }
    });

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

app.post('/send-welcome', async (req, res) => {
    try {
        const htmlContent = await getWelcomeTemplate(req.body.name)

        const transporter = nodemailer.createTransport({
            host: process.env.HOST,
            port: 465, // Use 587 for TLS/STARTTLS
            secure: true, // true for port 465 (SSL), false for port 587 (TLS)
            auth: {
                user: 'users@peppubuild.com', // Your Namecheap Private Email address
                pass: process.env.PASSWORD // Your email account password
            }
        });

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
async function subscribeUser(email, planCode) {
    const response = await paystack.post('/subscription', {
        customer: email,
        plan: planCode
    });

    return response.data;
}

app.post('/paystack-webhook', (req, res) => {
  const event = req.body;

    
    if (event.event === 'charge.success') {
        return res.sendStatus(200).redirect('https://proctored.peppubuild.com/app');
    }
 

  // add posibility to redirect res.sendStatus(200).redirect();
  res.sendStatus(200);
});

app.listen(3000, () => console.log('Server running on port 3000'));
