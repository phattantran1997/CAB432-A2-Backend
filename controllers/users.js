const logger = require("../utils/logger");
const usersRouter = require("express").Router();
const User = require("../models/user");
const { 
  CognitoIdentityProviderClient, 
  SignUpCommand, 
  AdminSetUserPasswordCommand, 
  AssociateSoftwareTokenCommand, 
  AdminSetUserMFAPreferenceCommand 
} = require('@aws-sdk/client-cognito-identity-provider');
const {getParameter} = require('../services/ssm-service')

const cognitoClient = new CognitoIdentityProviderClient({ region: 'ap-southeast-2' });

usersRouter.get("/", async (request, response) => {
  const users = await User.find({}).populate("blogs", {
    title: 1,
    content: 1,
    dateCreated: 1,
    likes: 1,
  });
  response.json(users);
});


usersRouter.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "Username, email, and password are required" });
  }

  try {
    const signUpParams = {
      ClientId: await getParameter('COGNITO_CLIENT_ID'),
      Username: username,
      Password: password,
      UserAttributes: [
        {
          Name: 'email',
          Value: email, // Pass the email as required by Cognito
        },
        {
          Name: 'name',
          Value: username, // Optionally, you can pass the name
        },
      ],
    };

    const signUpCommand = new SignUpCommand(signUpParams);
    const signUpResponse = await cognitoClient.send(signUpCommand);

  res.status(201).json({ message: "User registered successfully", signUpResponse });
  } catch (error) {
    logger.error("Error registering user:", error);
    res.status(500).json({ error: "Failed to register user" });
  }
});


module.exports = usersRouter;
