const logger = require('./logger');
const { CognitoJwtVerifier } = require("aws-jwt-verify");
const {getParameter} = require('../services/ssm-service')

async function createJwtVerifier() {
  try {
    // Fetch the values from AWS Parameter Store
    const userPoolId = await getParameter('COGNITO_USER_POOL_ID');
    const clientId = await getParameter('COGNITO_CLIENT_ID');

    // Now pass the values to CognitoJwtVerifier.create
    const verifier = CognitoJwtVerifier.create({
      userPoolId: userPoolId, // This is now the resolved value
      tokenUse: "access",
      clientId: clientId, // This is now the resolved value
    });

    return verifier;
  } catch (error) {
    logger.error('Error creating JWT Verifier:', error);
    throw error;
  }
}


// Middleware to log requests
const requestLogger = (request, response, next) => {
  logger.info('Method:', request.method);
  logger.info('Path:  ', request.path);
  logger.info('Body:  ', request.body);
  logger.info('---');
  next();
};

// Middleware to extract and verify the token
const tokenExtractor = async (req, res, next) => {
  const authorization = req.get('authorization');
  
  if (!authorization || !authorization.toLowerCase().startsWith('bearer ')) {
    return res.status(401).json({ error: 'token missing or invalid' });
  }

  const token = authorization.substring(7);
  
  try {
    const verifier = await createJwtVerifier();
    // Verify the token using the aws-jwt-verify library
    const payload = await verifier.verify(token);
    
    // Attach the decoded payload (user info) to the request object
    req.user = payload;
    
    // Proceed to the next middleware
    next();
  } catch (error) {
    logger.error('Token verification failed:', error.message);
    return res.status(401).json({ error: 'invalid token' });
  }
};

// Middleware to handle unknown endpoints
const unknownEndpoint = (request, response) => {
  response.status(404).send({ error: 'unknown endpoint' });
};

// Error handling middleware
const errorHandler = (error, request, response, next) => {
  logger.error(error.message);

  if (error.name === 'CastError') {
    return response.status(400).send({ error: 'malformatted id' });
  } else if (error.name === 'ValidationError') {
    return response.status(400).json({ error: error.message });
  } else if (error.name === 'JsonWebTokenError') {
    return response.status(401).json({
      error: 'invalid token',
    });
  }

  next(error);
};

module.exports = {
  requestLogger,
  tokenExtractor,  // Added to verify token
  unknownEndpoint,
  errorHandler,
};
