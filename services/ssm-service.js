const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { fromIni } = require('@aws-sdk/credential-providers');  // Import credential provider
const logger = require("../utils/logger");

const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require('@aws-sdk/client-secrets-manager');
const credentials = fromIni({ profile: '901444280953_CAB432-STUDENT' });
const secrectManagerClient = new SecretsManagerClient({
  region: "ap-southeast-2",
  credentials: credentials,
});

const ssmClient = new SSMClient({
  region: 'ap-southeast-2',
  credentials
});
const getParameter = async (parameterName) => {
  try {
    const command = new GetParameterCommand({
      Name: '/n11486546/assignment2/backend/' + parameterName,
      WithDecryption: true, // Use WithDecryption if the parameter is stored as a SecureString
    });
    const response = await ssmClient.send(command);
    return response.Parameter.Value;
  } catch (err) {
    // Check if logger is available, otherwise use console.error
    if (logger && typeof logger.error === 'function') {
      logger.error(`Error retrieving parameter ${parameterName}:`, err);
    } else {
      console.error(`Error retrieving parameter ${parameterName}:`, err);
    }

    // Return a default value or rethrow the error depending on use case
    return null; // Or handle this in a way that is more appropriate for your application.
  }
};

const getYouTubeApiKeyFromSM = async () => {
  let response;

  try {
    response = await secrectManagerClient.send(
      new GetSecretValueCommand({
        SecretId: 'n11486546/assignment2/YoutubeAPIKey',
        VersionStage: "AWSCURRENT",
      })
    );
  } catch (error) {
    logger.error('Error fetching YouTube API key from Secrect Manager:', error);
    throw error;
  }
  // SecretString contains the secret data in JSON format
  if ('SecretString' in response) {
    const SecretString = response.SecretString;
    // Parse the SecretString (which is a JSON string)
    const parsedSecret = JSON.parse(SecretString);
    // Access the YOUTUBE_API_KEY value
    const secret = parsedSecret.YOUTUBE_API_KEY;
    return secret;
  } else {
    let buff = Buffer.from(response.SecretBinary, 'base64');
    const decodedSecret = buff.toString('ascii');
    const parsedSecret = JSON.parse(decodedSecret);
    const secret = parsedSecret.YOUTUBE_API_KEY;
    return secret;
  }

};


module.exports = { getParameter, getYouTubeApiKeyFromSM }