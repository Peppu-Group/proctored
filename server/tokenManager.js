const cookie = require('cookie');

let tokenStore = {
  accessToken: null,
  refreshToken: null,
  expiryDate: null,
};

// Helper function to set the tokens in memory and HttpOnly cookie
const setTokensInCookie = (res, refreshToken) => {
  res.cookie('refreshToken', refreshToken, {
    // httpOnly: true,
    // secure: false, // process.env.NODE_ENV === 'production',  // Secure cookie flag in production
    // sameSite: 'None', // or 'Lax'
    maxAge: 60 * 60 * 24 * 30 * 1000, // 30 days
  });
};

// Helper function to retrieve the refresh token from cookies
const getRefreshTokenFromCookie = (req) => {
  const cookies = cookie.parse(req.headers.cookie || '');
  return cookies.refreshToken || null;
};

// Token manager for managing access and refresh tokens
module.exports = {
  setTokens: ({ access_token, refresh_token, expires_in }) => {
    tokenStore.accessToken = access_token;
    tokenStore.refreshToken = refresh_token;
    tokenStore.expiryDate = Date.now() + expires_in * 1000;
  },

  getAccessToken: () => tokenStore.accessToken,

  getRefreshToken: () => tokenStore.refreshToken,

  isAccessTokenExpired: () => Date.now() >= tokenStore.expiryDate,

  updateAccessToken: (access_token, expires_in) => {
    tokenStore.accessToken = access_token;
    tokenStore.expiryDate = Date.now() + expires_in * 1000;
  },

  setTokensInCookie,
  getRefreshTokenFromCookie,
};
