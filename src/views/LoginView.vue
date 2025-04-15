<template>
    <body>
        <div class="container">
            <h1>Login with Google</h1>
            <button id="google-login" class="google-btn" @click="getlogin()">
                <img src="https://developers.google.com/identity/images/g-logo.png" alt="Google logo">
                <span>Sign in with Google</span>
            </button>
        </div>
    </body>
</template>

<style scoped>
body {
    margin: 0;
    padding: 0;
    font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
    background-color: #2c3e5e;
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
}

.container {
    background: white;
    padding: 40px;
    border-radius: 16px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    text-align: center;
    max-width: 400px;
    width: 100%;
}

h1 {
    margin-bottom: 20px;
    color: #333;
}

.google-btn {
    display: inline-flex;
    align-items: center;
    background-color: #fff;
    color: #555;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 16px;
    padding: 10px 15px;
    cursor: pointer;
    transition: all 0.3s;
    text-decoration: none;
}

.google-btn:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.google-btn img {
    height: 20px;
    margin-right: 10px;
}

.status {
    margin-top: 20px;
    color: #333;
}
</style>

<script>
import qs from 'querystring';
const serverUrl = `http://localhost:3000`;
import axios from 'axios';

export default {
    name: 'LoginView',

    async mounted() {
        const { token, refresh } = this.$route.query;
        if (!token) return;

        try {
            // Fetch user info using the access token
            const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${token}` },
            });

            const { email, name } = userInfoResponse.data;

            // Store user information and tokens
            localStorage.setItem('email', email);
            localStorage.setItem('authToken', token);
            this.$store.commit('setAccessToken', token);

            if (refresh) {
                // Store the refresh token
                localStorage.setItem('refreshToken', encodeURIComponent(refresh));

                // Send welcome email
                try {
                    await axios.post(`${serverUrl}/send-welcome`, { name, email });
                } catch (err) {
                    Swal.fire("Error!", `An error occurred while sending the welcome email: ${err}`, "error");
                }
            } else {
                // Retrieve and store the refresh token if not present
                let refreshToken = localStorage.getItem('refreshToken');
                if (!refreshToken) {
                    try {
                        const res = await axios.get(`${serverUrl}/getrefresh/${email}`);
                        localStorage.setItem('refreshToken', encodeURIComponent(res.data));
                    } catch (err) {
                        Swal.fire("Error!", `An error occurred while retrieving the refresh token: ${err}`, "error");
                    }
                }
            }

            // Redirect to the main application page
            this.$router.push({ path: '/app' });

        } catch (err) {
            Swal.fire("Error!", `Failed to fetch user information: ${err}`, "error");
        }
    },

    methods: {
        async getlogin() {
            // NOTE: ONLY REDIRECT IF DATA IS OK.
            // OAuth2 URL for Google
            const OAUTH_URL = `https://accounts.google.com/o/oauth2/v2/auth?` +
                qs.stringify({
                    client_id: '890175963480-aqtb14i2tmu2m32fr035r03knncdtout.apps.googleusercontent.com',
                    redirect_uri: 'http://localhost:3000/oauth2callback',
                    response_type: 'code',
                    scope: 'openid profile email https://www.googleapis.com/auth/drive.file',
                    access_type: 'offline',  // Request offline access for refresh token
                });
            try {
                window.location.href = OAUTH_URL;
            } catch (err) {
                Swal.fire("Error!", `An error occurred, could be your network connection: ${err}`, "error");
            }
        }
    }
}
</script>