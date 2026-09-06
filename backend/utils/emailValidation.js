const crypto = require('crypto');

const generateToken = () => {
    const token  = crypto.randomBytes(32).toString("hex");

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const expire = new Date(
        Date.now() + 24*60*60*1000
    );

    return {
        token,hashedToken,expire
    }
}

module.exports = {generateToken}