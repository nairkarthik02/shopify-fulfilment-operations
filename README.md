# Shopify Invoice and Picklist Generator

## Overview

This project automates the generation of invoices and picklists for a Shopify store using Google Sheets and Google Apps Script. It helps streamline the fulfillment and operational tasks by logging data and automating repetitive processes.

## Features

- **Invoice Generation**: Automatically create and send invoices based on Shopify order data.
- **Picklist Generation**: Generate picklists for efficient order picking in the warehouse.
- **Data Logging**: Log all order details, fulfillment statuses, and operational data in a Google Sheet.
- **Automation**: Utilize Google Apps Script to automate the generation and logging processes.

## Requirements

- Google Account
- Access to Google Sheets
- Basic knowledge of Google Apps Script
- Shopify store with API access

## Setup

### Google Sheets

1. Create a new Google Sheet for logging order data.
2. Set up the necessary columns for order details, fulfillment status, and other relevant data.

### Google Apps Script

1. Open the Google Sheet and navigate to `Extensions` > `Apps Script`.
2. Copy and paste your script into the Apps Script editor.
3. Save the script with an appropriate name.
4. Set up triggers for the functions as needed (e.g., to run daily).

### Shopify API Setup

1. Create a private app in your Shopify admin panel.
2. Generate an API key and password.
3. Update the script with your Shopify store details.

## Usage

1. **Fetch Orders**: Run the `fetchShopifyOrders` function to log new orders into the Google Sheet.
2. **Generate Invoice**: Call the `generateInvoice(orderId)` function with a specific order ID to send an invoice to the customer.
3. **Generate Picklist**: Execute the `generatePicklist` function to create a picklist for all unfulfilled orders.



## Contact

For any inquiries or feedback, please contact [your email].

---

### Screenshots

Google Sheet
![image](https://github.com/nairkarthik02/shopify-ops/assets/85906964/bacf372a-7601-434f-8700-57049b4661f9)


Picklist
![image](https://github.com/nairkarthik02/shopify-ops/assets/85906964/20d986f2-8485-4d3f-9d99-49f23185c3b6)





---

### Acknowledgements

- Special thanks to the contributors of the Google Apps Script community.
- Thanks to Shopify for providing an accessible API.
