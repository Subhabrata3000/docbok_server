// middleware/auth.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = function (req, res, next) {
  // 1. Get the token from the header
  const authHeader = req.header('Authorization');

  // 2. Check if no token
  if (!authHeader) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    // 3. Check if token format is correct (e.g., "Bearer YOUR_TOKEN")
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ msg: 'Token format is invalid' });
    }

    // 4. Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 5. Add the user payload (id, role) to the request object
    req.user = decoded.user;

    // 6. Move on to the next function (the actual route)
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};