const express = require('express');
const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand
} = require('@aws-sdk/client-cognito-identity-provider');
const loginRouter = express.Router();
const {getParameter} = require('../services/ssm-service')
const logger = require("../utils/logger");

// Cognito Client Setup
const cognitoClient = new CognitoIdentityProviderClient({ region: 'ap-southeast-2' });



loginRouter.post("/", async (req, res) => {
  const { username, password } = req.body;

  const params = {
    AuthFlow: 'USER_PASSWORD_AUTH',
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
    },
    ClientId: await getParameter('COGNITO_CLIENT_ID'),
  };

  try {
    const command = new InitiateAuthCommand(params);
    const authResult = await cognitoClient.send(command);

    if (authResult.ChallengeName === 'MFA_SETUP') {
      // MFA setup is required for the user
      res.status(206).json({
        message: 'MFA setup required',
        mfaType: 'MFA_SETUP',
        session: authResult.Session,
      });
    } else if (authResult.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
      // MFA verification required (for users who already set up MFA)
      res.status(206).json({
        message: 'MFA required',
        mfaType: 'SOFTWARE_TOKEN_MFA',
        session: authResult.Session,
      });
    } else {
      // Successful login without MFA
      res.status(200).json({
        message: 'Login successful',
        idToken: authResult.AuthenticationResult.IdToken,
        accessToken: authResult.AuthenticationResult.AccessToken,
      });
    }
  } catch (error) {
    logger.error("Error during login:", error);
    res.status(401).json({ error: 'Invalid username or password' });
  }
});

// MFA Setup Route
loginRouter.post("/mfa-setup", async (req, res) => {
  const { session } = req.body;
  console.log(session);
  const sessionString = session.session;
  const params = {
    Session: sessionString,
  };

  try {
    const command = new AssociateSoftwareTokenCommand(params);
    const authResult = await cognitoClient.send(command);

    res.status(200).json({
      message: 'MFA setup successful',
      secretCode: authResult.SecretCode,
      session: authResult.Session
    });
  } catch (error) {
    logger.error("Error during MFA setup:", error);
    res.status(500).json({ error: 'Failed to set up MFA' });
  }
});

loginRouter.post("/verifyMfa", async (req, res) => {
  const { username, session, mfaCode, challengeName } = req.body;
  console.log("challengeName", challengeName);
  try {
    if (challengeName === 'MFA_SETUP') {
      const verifyParams = {
        Session: session,
        UserCode: mfaCode,
      };

      try {
        console.log('Attempting MFA verification with session:', session);
        const verifyCommand = new VerifySoftwareTokenCommand(verifyParams);
        const verifyResult = await cognitoClient.send(verifyCommand);
        if (verifyResult.Status === 'SUCCESS') {
          console.log('MFA setup and verification successful');
          res.status(200).json({
            message: 'MFA setup and verification successful',
            session: verifyResult.Session, 
          });
        } else {
          console.log('MFA setup verification failed. Status:', verifyResult.Status);
          res.status(401).json({ error: 'MFA setup verification failed' });
        }
      } catch (error) {
        logger.error('Error during MFA verification:', error);
        if (error.name === 'NotAuthorizedException') {
          res.status(401).json({ error: 'Invalid session. Please try authenticating again.' });
        } else {
          res.status(500).json({ error: 'An error occurred during MFA verification' });
        }
      }
    } else if (challengeName === 'SOFTWARE_TOKEN_MFA') {
      // Case 2: Regular login with MFA already setup
      const authParams = {
        ChallengeName: 'SOFTWARE_TOKEN_MFA',
        ChallengeResponses: {
          USERNAME: username,
          SOFTWARE_TOKEN_MFA_CODE: mfaCode,
        },
        Session: session,
        ClientId: await getParameter('COGNITO_CLIENT_ID'),
      };

      const authCommand = new RespondToAuthChallengeCommand(authParams);
      const authResult = await cognitoClient.send(authCommand);
      console.log("Access Token: "+authResult.AuthenticationResult.AccessToken);
      // Send tokens after successful MFA verification
      res.status(200).json({
        message: 'MFA verification successful',
        idToken: authResult.AuthenticationResult.IdToken,
        accessToken: authResult.AuthenticationResult.AccessToken,
        refreshToken: authResult.AuthenticationResult.RefreshToken,
      });
    } else {
      res.status(400).json({ error: 'Invalid challenge name' });
    }
  } catch (error) {
    logger.error("Error during MFA verification:", error);
    res.status(401).json({ error: 'MFA verification failed' });
  }
});


module.exports = loginRouter;
