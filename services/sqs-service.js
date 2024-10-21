const { SQS } = require('@aws-sdk/client-sqs');
const { fromIni } = require('@aws-sdk/credential-providers');
const logger = require("../utils/logger");

// Configure AWS credentials using fromIni and specify a profile
const credentials = fromIni({ profile: '901444280953_CAB432-STUDENT' });

const sqs = new SQS({
  region: 'ap-southeast-2', 
  credentials,
});

const queueUrl = 'https://sqs.ap-southeast-2.amazonaws.com/901444280953/n11486546-test-queue-1';

/**
 * Send a message to SQS
 * @param {Object} messageBody - The message to be sent to SQS
 */
const sendMessageToQueue = async (messageBody) => {
  const params = {
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(messageBody),
  };

  try {
    const result = await sqs.sendMessage(params);
    logger.info(`Message sent to SQS with MessageId: ${result.MessageId}`);
    return result.MessageId;
  } catch (error) {
    logger.error('Error sending message to SQS:', error);
    throw error;
  }
};

/**
 * Poll messages from SQS
 * @param {number} maxNumberOfMessages - Maximum number of messages to retrieve
 * @param {number} visibilityTimeout - The duration (in seconds) that the received messages are hidden
 * @param {number} waitTimeSeconds - The amount of time to wait for a message to arrive
 */
const receiveMessagesFromQueue = async (maxNumberOfMessages = 1, visibilityTimeout = 60, waitTimeSeconds = 20) => {
  const params = {
    QueueUrl: queueUrl,
    MaxNumberOfMessages: maxNumberOfMessages,
    VisibilityTimeout: visibilityTimeout,
    WaitTimeSeconds: waitTimeSeconds,
  };

  try {
    const data = await sqs.receiveMessage(params);
    if (data.Messages && data.Messages.length > 0) {
      logger.info(`Received ${data.Messages.length} message(s) from SQS`);
      return data.Messages;
    }
    return [];
  } catch (error) {
    logger.error('Error receiving messages from SQS:', error);
    throw error;
  }
};

/**
 * Delete a message from SQS
 * @param {string} receiptHandle - The receipt handle associated with the message to delete
 */
const deleteMessageFromQueue = async (receiptHandle) => {
  const params = {
    QueueUrl: queueUrl,
    ReceiptHandle: receiptHandle,
  };

  try {
    await sqs.deleteMessage(params);
    logger.info('Message deleted from SQS successfully');
  } catch (error) {
    logger.error('Error deleting message from SQS:', error);
    throw error;
  }
};

module.exports = {
  sendMessageToQueue,
  receiveMessagesFromQueue,
  deleteMessageFromQueue,
};
