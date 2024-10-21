const express = require('express');
const ssmRouter = express.Router();
const { getParameter } = require('../services/ssm-service')
const logger = require("../utils/logger");

//get cognito hosted UI from parameter store
ssmRouter.get("/paramter", async (req, res) => {
    const parameter = req.query.parameter;
    try {
        const value = await getParameter(parameter);

        if (value) {
            res.status(200).json(value);
        }else{
            res.status(404).json("not found");
        }
    } catch (error) {
        logger.error("Error during login:", error);
        res.status(401).json({ error: 'Invalid username or password' });
    }
});

module.exports = ssmRouter;
