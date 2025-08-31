### **README.md (Quick Setup Guide)**

**File:** `README.md`
```markdown
# Black Hash Lottery Bot

This is a Node.js Telegram bot for a tiered Bitcoin hash-based raffle system.

## Setup Instructions

1.  **Clone the repository:**
    ```bash
    git clone [repository-url]
    cd black-hash-lottery-bot
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up your environment variables:**
    Create a `.env` file in the project root with the following content:
    ```
    TELEGRAM_BOT_TOKEN="YOUR_TELEGRAM_BOT_TOKEN_HERE"
    DATABASE_URL="postgres://user:password@host:port/database"
    ```

4.  **Run database migrations:**
    This will create the necessary tables in your PostgreSQL database.
    ```bash
    npx sequelize-cli db:migrate
    ```

5.  **Start the bot:**
    ```bash
    npm start
    ```

## Project Structure

* `app.js`: Main application file.
* `config/`: Database configuration.
* `models/`: Sequelize model definitions for the database tables.
* `migrations/`: Files for creating and modifying the database schema.
* `handlers/`: Separate files for different bot functionalities.
* `README.md`: This file.
* `package.json`: Project dependencies.