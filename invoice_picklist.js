let shopify_admin_name="{your shopify admin name}"
let base64Logo="{your business logo base64}"





//pending orders with following SOP and SLA of operations and fulfillment.  This is the conventional method

function getPendingOrderData() {

  //data being fetched from the shopify order api

  let pageSize = 250
  let pageUrl = `https://${shopify_admin_name}/admin/api/2023-01/orders.json?limit=${pageSize}&fulfillment_status=unfulfilled`;
  let fetchMoreOrders = true;
  let allOrders = [];
  pageUrl = encodeURI(pageUrl)
  while (fetchMoreOrders) {
    let shopifyResponse = getShopifyOrdersByPageLink(pageUrl);
    let orders = shopifyResponse.productArray;
    pageUrl = shopifyResponse.nextPageUrl;
    
    fetchMoreOrders = orders.length < pageSize || pageUrl.length === 0 ? false : true;
    allOrders = allOrders.concat(orders);
    console.log(allOrders.length);
  }
  
  allOrders = allOrders.filter(order => !(order.financial_status === 'voided' || order.cancelled_at !== null))
  

  //effective line items set made
  let ordersData = []
  let productIdVariantIdCommitedQuantity = {}
  for (let order of allOrders) {
    if (order && order.line_items) {
      let effectiveLineItems = getOrderFilteredLineItems(order)
      let orderNumber = order['order_number']
      let date = order['created_at']
      let phone = order.shipping_address ? order.shipping_address.phone : "N/A";
      let shipping_lines = order.shipping_lines ? order.shipping_lines : []
      let shipping_address = order.shipping_address ? order.shipping_address : {}
      let billing_address = order.billing_address ? order.billing_address : {}
      if (phone === "N/A") {
        phone = order.billing_address ? order.billing_address.phone : "N/A";
      }
      let orderData = {
        'order_number': orderNumber,
        'created_at': date,
        'productsData': [],
        'orderValue': parseInt(order['current_total_price']),
        'subTotalValue':parseFloat(order['current_subtotal_price']).toFixed(2),
        'taxValue':parseFloat(order['current_total_tax']).toFixed(2),
        'type': (order['financial_status'] === 'pending') ? "COD" : "PREPAID",
        'payment_gateway_names': order["payment_gateway_names"],
        'phone': phone,
        'shipping_lines': shipping_lines,
        'shipping_address': shipping_address,
        'billing_address': billing_address,
        'totalWeight':order['total_weight'],
        'current_total_discounts':order['current_total_discounts']
      }
      for (let item of effectiveLineItems) {
        let item_name = item['name']
        let productId = item['product_id']
        let variantId = item['variant_id']
        let quantity = item['quantity']
        let sku = item['sku']
        let price = item['price']
        let tax_lines = item['tax_lines']
        orderData.productsData.push({
          'name': item_name,
          'productId': productId,
          'variantId': variantId,
          'quantity': quantity,
          'sku': sku,
          'price': price,
          'tax_lines': tax_lines
        })
        if (!productIdVariantIdCommitedQuantity[productId] || !productIdVariantIdCommitedQuantity[productId][variantId]) {
          productIdVariantIdCommitedQuantity[productId] = {
            [variantId]: 0
          }
        }
        productIdVariantIdCommitedQuantity[productId][variantId] += quantity
      }
      ordersData.push(orderData)
    }
  }
  ordersData.sort((a, b) => {
    let dateA = new Date(a.created_at);
    let dateB = new Date(b.created_at);

    return dateA - dateB;
  })
  

  // the orders are to be sorted with 

  let productIds = Object.keys(productIdVariantIdCommitedQuantity)
  let productVariantAvailableInventory = {}
  while (productIds.length > 0) {
    let ids = productIds.splice(0, 50)
    let products = shopifyGetRequest(`https://${shopify_admin_name}/admin/api/2023-01/products.json?ids=${ids.join(",")}&fields=id,status,created_at,variants`)
    for (let product of products['products']) {
      if (product.variants) {
        for (let variant of product.variants) {
          if (!productVariantAvailableInventory[variant.product_id] || !productVariantAvailableInventory[variant.product_id][variant.id]) {
            productVariantAvailableInventory[variant.product_id] = {
              [variant.id]: variant.inventory_quantity
            }
          }
        }
      }
    }
  }

  let productIdVariantIdOnHandInventory = JSON.parse(JSON.stringify(productIdVariantIdCommitedQuantity))
  for (let productId in productIdVariantIdOnHandInventory) {
    for (let variantId in productIdVariantIdOnHandInventory[productId]) {
      if (productVariantAvailableInventory[productId] && productVariantAvailableInventory[productId][variantId]) {
        productIdVariantIdOnHandInventory[productId][variantId] += productVariantAvailableInventory[productId][variantId]
      }
    }
  }

  // here we are orders with any missing item in the inventory and while generating the invoice and picklist only the ones with missing_items=0 will be generated

  let appendData = []
  let uniqueSKUSet = new Set()
  for (let order of ordersData) {
    let missingItems = 0
    let missingSkus = []
    for (let item of order.productsData) {
      let productId = item.productId
      let variantId = item.variantId
      let quantity = item.quantity
      productIdVariantIdOnHandInventory[productId][variantId] -= quantity
      if (productIdVariantIdOnHandInventory[productId][variantId] < 0) {
        missingItems++
        missingSkus.push(item.sku)
        uniqueSKUSet.add(item.sku)
      }
    }

    appendData.push({
      'order_number': order.order_number,
      'created_at': String(order.created_at.split('T')[0]) + " " + String((order.created_at.split('T')[1]).split('+')[0]),
      'order_date': order.created_at.split('T')[0],
      'phone': order.phone,
      'unique_items': order.productsData.length,
      'missing_items': missingItems,
      'line_items': order.productsData,
      'order_subtotal':order.subTotalValue,
      'order_tax':order.taxValue,
      'order_amount': order.orderValue,
      'payment_method': order.type,
      'payment_gateway_names': order.payment_gateway_names,
      'missing_sku': missingSkus.join(',  '),
      'total_missing_sku_till_order': Array.from(uniqueSKUSet).sort().join(', '),
      'picklist_generated': String(current_date_time()),
      'type': order.type,
      'shipping_lines': order.shipping_lines,
      'shipping_address': order.shipping_address,
      'billing_address': order.billing_address,
      'totalWeight':order.totalWeight,
      'current_total_discounts':order.current_total_discounts
    })
  }
  

  let orderssss = appendData.filter(function (x) {
    return x.missing_items == 0;
  }).sort(function (a, b) {
    return new Date(a.created_at) - new Date(b.created_at) || parseFloat(b.order_amount) - parseFloat(a.order_amount);
  });

  console.log(orderssss.length)

  

  console.log(orderssss.map(c => ({ order_number:c.order_number,missing: c.missing_items, date: c.created_at })))
  return orderssss
}










// adhoc orders being returned
function getPendingOrderDataAdhoc() {
  let pageSize = 250
  let pageUrl = `https://${shopify_admin_name}/admin/api/2023-01/orders.json?limit=${pageSize}&fulfillment_status=unfulfilled`;
  let fetchMoreOrders = true;
  let allOrders = [];
  pageUrl = encodeURI(pageUrl)
  while (fetchMoreOrders) {
    let shopifyResponse = getShopifyOrdersByPageLink(pageUrl);
    let orders = shopifyResponse.productArray;
    pageUrl = shopifyResponse.nextPageUrl;
    
    fetchMoreOrders = orders.length < pageSize || pageUrl.length === 0 ? false : true;
    allOrders = allOrders.concat(orders);
    console.log(allOrders.length);
  }
 
  allOrders = allOrders.filter(order => !(order.financial_status === 'voided' || order.cancelled_at !== null))
  

  let ordersData = []
  let productIdVariantIdCommitedQuantity = {}
  for (let order of allOrders) {
    if (order && order.line_items) {
      let effectiveLineItems = getOrderFilteredLineItems(order)
      let orderNumber = order['order_number']
      let date = order['created_at']
      let phone = order.shipping_address ? order.shipping_address.phone : "N/A";
      let shipping_lines = order.shipping_lines ? order.shipping_lines : []
      let shipping_address = order.shipping_address ? order.shipping_address : {}
      let billing_address = order.billing_address ? order.billing_address : {}
      if (phone === "N/A") {
        phone = order.billing_address ? order.billing_address.phone : "N/A";
      }
      let orderData = {
        'order_number': orderNumber,
        'created_at': date,
        'productsData': [],
        'orderValue': parseInt(order['current_total_price']),
        'subTotalValue':parseFloat(order['current_subtotal_price']).toFixed(2),
        'taxValue':parseFloat(order['current_total_tax']).toFixed(2),
        'type': (order['financial_status'] === 'pending') ? "COD" : "PREPAID",
        'payment_gateway_names': order["payment_gateway_names"],
        'phone': phone,
        'shipping_lines': shipping_lines,
        'shipping_address': shipping_address,
        'billing_address': billing_address,
        'totalWeight':order['total_weight'],
        'current_total_discounts':order['current_total_discounts']
      }
      for (let item of effectiveLineItems) {
        let item_name = item['name']
        let productId = item['product_id']
        let variantId = item['variant_id']
        let quantity = item['quantity']
        let sku = item['sku']
        let price = item['price']
        let tax_lines = item['tax_lines']
        orderData.productsData.push({
          'name': item_name,
          'productId': productId,
          'variantId': variantId,
          'quantity': quantity,
          'sku': sku,
          'price': price,
          'tax_lines': tax_lines
        })
        if (!productIdVariantIdCommitedQuantity[productId] || !productIdVariantIdCommitedQuantity[productId][variantId]) {
          productIdVariantIdCommitedQuantity[productId] = {
            [variantId]: 0
          }
        }
        productIdVariantIdCommitedQuantity[productId][variantId] += quantity
      }
      ordersData.push(orderData)
    }
  }
  ordersData.sort((a, b) => {
    let dateA = new Date(a.date);
    let dateB = new Date(b.date);

    return dateA - dateB;
  })


  let productIds = Object.keys(productIdVariantIdCommitedQuantity)
  let productVariantAvailableInventory = {}
  while (productIds.length > 0) {
    let ids = productIds.splice(0, 50)
    let products = shopifyGetRequest(`https://${shopify_admin_name}/admin/api/2023-01/products.json?ids=${ids.join(",")}&fields=id,status,created_at,variants`)
    for (let product of products['products']) {
      if (product.variants) {
        for (let variant of product.variants) {
          if (!productVariantAvailableInventory[variant.product_id] || !productVariantAvailableInventory[variant.product_id][variant.id]) {
            productVariantAvailableInventory[variant.product_id] = {
              [variant.id]: variant.inventory_quantity
            }
          }
        }
      }
    }
  }

  let productIdVariantIdOnHandInventory = JSON.parse(JSON.stringify(productIdVariantIdCommitedQuantity))
  for (let productId in productIdVariantIdOnHandInventory) {
    for (let variantId in productIdVariantIdOnHandInventory[productId]) {
      if (productVariantAvailableInventory[productId] && productVariantAvailableInventory[productId][variantId]) {
        productIdVariantIdOnHandInventory[productId][variantId] += productVariantAvailableInventory[productId][variantId]
      }
    }
  }

  

  let appendData = []
  let uniqueSKUSet = new Set()
  for (let order of ordersData) {
    let missingItems = 0
    let missingSkus = []
    for (let item of order.productsData) {
      let productId = item.productId
      let variantId = item.variantId
      let quantity = item.quantity
      productIdVariantIdOnHandInventory[productId][variantId] -= quantity
      if (productIdVariantIdOnHandInventory[productId][variantId] < 0) {
        missingItems++
        missingSkus.push(item.sku)
        uniqueSKUSet.add(item.sku)
      }
    }

    appendData.push({
      'order_number': order.order_number,
      'created_at': String(order.created_at.split('T')[0]) + " " + String((order.created_at.split('T')[1]).split('+')[0]),
      'order_date': order.created_at.split('T')[0],
      'phone': order.phone,
      'unique_items': order.productsData.length,
      'missing_items': missingItems,
      'line_items': order.productsData,
      'order_subtotal':order.subTotalValue,
      'order_tax':order.taxValue,
      'order_amount': order.orderValue,
      'payment_method': order.type,
      'payment_gateway_names': order.payment_gateway_names,
      'missing_sku': missingSkus.join(',  '),
      'total_missing_sku_till_order': Array.from(uniqueSKUSet).sort().join(', '),
      'picklist_generated': String(current_date_time()),
      'type': order.type,
      'shipping_lines': order.shipping_lines,
      'shipping_address': order.shipping_address,
      'billing_address': order.billing_address,
      'totalWeight':order.totalWeight,
      'current_total_discounts':order.current_total_discounts
    })
  }
  

  
  return appendData
}






function current_date_time() {
  var date = new Date();
  var formattedDate = Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
  
  return formattedDate
}

function picklistSheetTime() {
  var date = new Date();
  console.log(Session.getScriptTimeZone())
  var formattedDate = Utilities.formatDate(date, Session.getScriptTimeZone(), "dd-MM-yyyy");

  let fortmattedTime=Utilities.formatDate(date,Session.getScriptTimeZone(),"HH:mm:ss")
  
  return {picklistDate:formattedDate,picklistTime:fortmattedTime}
}




function shopifyGetRequest(url) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': '{your shopify access token}',
    'Accept-Encoding': 'gzip,deflate,compress',
  };

  const options = {
    method: 'get',
    headers: headers,
    muteHttpExceptions: false // Allows catching HTTP errors
  };
  try {
    let response = UrlFetchApp.fetch(url, options);
    response = JSON.parse(response.getContentText());
    return response
  } catch (error) {
    console.log(error)
    throw new Error(error)
  }
}




function getOrderFilteredLineItems(order) {
  let effectiveLineItems = []
  let toRemoveLineItemIds = []

  //line items which are partially refunded are removed from the pickist and invoice
  if (order.refunds) {
    for (let refund of order.refunds) {
      if (refund.refund_line_items) {
        refund.refund_line_items.forEach(entry => {
          toRemoveLineItemIds.push(entry.line_item_id)
        })
      }
    }
  }
  if (order.line_items) {
    for (let lineItem of order.line_items) {
      if (toRemoveLineItemIds.indexOf(lineItem.id) === -1) {
        effectiveLineItems.push(lineItem)
      }
    }
  }
  return effectiveLineItems
}


function getShopifyOrdersByPageLink(url) {
  const REGEX = /<([^>]+)>;\srel="next"/;

  const headers = {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': '{your shopify acces token}',
    'Accept-Encoding': 'gzip,deflate,compress',
  };

  const options = {
    method: 'get',
    headers: headers,
    muteHttpExceptions: true, // Allows catching HTTP errors
  };

  let productArray = [];
  let nextPageUrl = '';
  let response;

  try {
    const res = UrlFetchApp.fetch(url, options);
    response = JSON.parse(res.getContentText());
    const nextPageLink = res.getHeaders()['Link'];

    if (response.orders) {
      productArray = response.orders;
    }

    if (nextPageLink && nextPageLink.length !== 0) {
      try {
        nextPageUrl = nextPageLink.match(REGEX)[1];
      } catch (e) {
        nextPageUrl = '';
      }
    }
  } catch (error) {
    console.log(error);
    throw new Error(error);
  }

  return { nextPageUrl: nextPageUrl, productArray: productArray };
}





//v4
function generatePicklistFromShopify() {
  // Fetch orders
  const order_pending = getPendingOrderData();
  console.log(order_pending);

  let picklistGeneratedTimestamp = picklistSheetTime();

  let picklistGeneratedDate=picklistGeneratedTimestamp.picklistDate

  let picklistGeneratedTime=picklistGeneratedTimestamp.picklistTime


  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Orders');
 


  const pdfSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PDF Links');
  if (!pdfSheet) {
    throw new Error('PDF Links sheet not found');
  }
  
  const existingBatchNumbers = pdfSheet.getRange('A:A').getValues().flat();

  //we will be assignaing batch name to each generation
  const batchNumber = generateUniqueBatchNumber(picklistGeneratedDate, existingBatchNumbers);
  

  //orders that are to be cancelled
  const cancellation_sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Orders To Be Cancelled');

  //orders that are to be escalated
  const escalation_sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Orders To Be Escalated');

  


  const order_range = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1); 
  const existingOrderNumbers = order_range.getValues().map(row => row[0]);
  const orderNumberSet = new Set(existingOrderNumbers);

  // Filter new orders to only include those not in the spreadsheet
  const newOrders_1 = order_pending.filter(order => !orderNumberSet.has(order.order_number));


  const order_range_support = cancellation_sheet.getRange(2, 1, sheet.getLastRow() - 1, 1); // Assumes order numbers are in the first column
  const support_cancellation = order_range_support.getValues().map(row => row[0]);
  const orderNumberSetSupport = new Set(support_cancellation);

  const order_range_escalation = escalation_sheet.getRange(2, 1, escalation_sheet.getLastRow() - 1, 1); // Assumes order numbers are in the first column
  const escalation_orders = order_range_escalation.getValues().map(row => row[0]);
  const orderNumberSetEscalation = new Set(escalation_orders);

  // Filter new orders to only include those not in the spreadsheet
  const newOrders_2 = newOrders_1.filter(order => !orderNumberSetSupport.has(order.order_number));


  //if is in escalated sheet then the order is unshifted further into the starting of the array
  newOrders_2.forEach(function(order, index) {
    if (orderNumberSetEscalation.has(order.order_number)) {
      order.escalated = "YES";
      newOrders_2.splice(index, 1);
      newOrders_2.unshift(order);
    }
  });
  const newOrders_3 = newOrders_2.filter(order => !orderNumberSet.has(order.order_number));


  const orders_slice = newOrders_3.slice(0, 40);


  

  //names taken from the sheet as input
  const namesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Actor Names');
  if (!namesSheet) {
    throw new Error('Names sheet not found');
  }

  
  const namesRange = namesSheet.getRange(2, 1, namesSheet.getLastRow() - 1, 1);
  const namesData = namesRange.getValues();

  const names = namesData.map(row => row[0]).filter(name => name.trim() !== '');

  
  let assignments = names.map(name => ({ name, totalItems: 0, orders: [] }));

  // we have to assign picklist to an picking actor for the data to be logged. All the actors will be assigned orders on the basis of comparable distribution of SKUs to each actor

  orders_slice.sort((a, b) => b.unique_items - a.unique_items);

  // Assign orders to actors
  orders_slice.forEach(order => {
    
    let minName = assignments.reduce((min, current) => {
      return (current.totalItems < min.totalItems) ? current : min;
    });

    
    minName.orders.push(order);
    minName.totalItems += order.unique_items;

    
    order.actor = minName.name
    order.batchNumber=batchNumber;
  })

  orders=orders_slice
  console.log(orders[0])
  console.log(assignments)
  const range = sheet.getDataRange();
  const values = range.getValues();
  
  
 

  if (orders.length){

    
    


    todaydate=getFormattedDate()




    file_name=`${todaydate}_${orders[0].order_number}_${orders[orders.length-1].order_number}`



    

    

    var picklist_html = generateCombinedInvoiceHTMLPicklist(orders);
  
    var picklist_blob = HtmlService.createHtmlOutput(picklist_html).getBlob().getAs('application/pdf');
    var picklist_file = DriveApp.createFile(picklist_blob);
    picklist_file.setName(`${file_name}_Picklist.pdf`);
    Logger.log('Combined PDF created: ' + picklist_file.getUrl());




    var invoice_html = generateCombinedInvoiceHTML(orders);
  
    var invoice_blob = HtmlService.createHtmlOutput(invoice_html).getBlob().getAs('application/pdf');
    var invoice_file = DriveApp.createFile(invoice_blob);
    invoice_file.setName(`${file_name}_Invoice.pdf`);
    Logger.log('Combined PDF created: ' + invoice_file.getUrl());

    const emails = []  // list the emails you want to share the picklists and invoices
    picklist_file.getEditors().forEach(editor => {
      picklist_file.removeEditor(editor.getEmail());
    });
    picklist_file.getViewers().forEach(viewer => {
      picklist_file.removeViewer(viewer.getEmail());
    });

  // Set access for each specific email
    emails.forEach(email => {
      picklist_file.addViewer(email); 
    });


    invoice_file.getEditors().forEach(editor => {
      invoice_file.removeEditor(editor.getEmail());
    });
    invoice_file.getViewers().forEach(viewer => {
      invoice_file.removeViewer(viewer.getEmail());
    });

  // Set access for each specific email
    emails.forEach(email => {
      invoice_file.addViewer(email); 
    });

    const pdfUrl_picklist = picklist_file.getUrl();
    const pdfUrl_invoice=invoice_file.getUrl();
    const downloadUrl_picklist = "https://drive.google.com/uc?export=download&id=" + picklist_file.getId(); // Direct download link
    const downloadUrl_invoice="https://drive.google.com/uc?export=download&id=" + invoice_file.getId();

    
    const pdf_sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PDF Links');
    if (!pdf_sheet) {
      // If no sheet found, create it and set headers
      const pdf_newSheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('PDF Links');
      pdf_newSheet.appendRow(['Piclist Download URL', 'Invoice Download URL','Picklist Generated','Number of Orders']);
    }

    // Append the PDF URL and picklist generated time to the sheet
    pdf_sheet.appendRow([batchNumber,downloadUrl_picklist,downloadUrl_invoice, picklistGeneratedDate,picklistGeneratedTime,orders.length,"Conventional"]);


    let orderMap = new Map();
    values.forEach((row, index) => {
      if (index !== 0) { 
        orderMap.set(row[0], index); 
      }
    });

    let updates = [];
    let newRows = [];

    // Process each order
    orders.forEach(order => {
      const data = [
        order.order_number || 'N/A',
        order.created_at || 'N/A',
        order.picklist_generated || 'N/A',
        "Conventional",
        order.actor||'N/A',
        order.unique_items||'N/A',
        batchNumber,picklistGeneratedDate
      ];

      if (orderMap.has(order.order_number)) {
        // Order number exists, prepare data for batch update
        const rowIndex = orderMap.get(order.order_number);
        updates.push({ range: sheet.getRange(rowIndex + 1, 1, 1, data.length), values: [data] });
      } else {
        // Append new row if order number does not exist
        newRows.push(data);
      }
    });

    // Perform all updates in one batch operation
    if (updates.length > 0) {
      updates.forEach(update => update.range.setValues(update.values));
    }

    // Append all new rows in another batch operation if necessary
    if (newRows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
    }

    
    }
  
}


function generateUniqueBatchNumber(date, existingBatchNumbers) {
  // Find existing batch numbers for the current date
  const existingBatchNumbersForDate = existingBatchNumbers.filter(batch => batch.startsWith(date));

  // Determine the next batch number
  const nextBatchNumber = existingBatchNumbersForDate.length + 1;

  // Combine date and batch number to form the unique batch number
  console.log(`${date}_${nextBatchNumber}`)
  return `${date}_${nextBatchNumber}`;
}





function generatePicklistFromShopifyAdhoc() {
  // Fetch orders
  const order_pending = getPendingOrderDataAdhoc();
  console.log(order_pending);

  let picklistGeneratedTimestamp = picklistSheetTime();

  let picklistGeneratedDate=picklistGeneratedTimestamp.picklistDate

  let picklistGeneratedTime=picklistGeneratedTimestamp.picklistTime


  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Orders')
  const sheet_adhoc = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Orders Adhoc');
  if (!sheet_adhoc) {
    // If no sheet found, create it and set headers
    const newSheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Orders');
    newSheet.appendRow(['Order Number', 'Order Date', 'Picklist Generated']);
  }

  const pdfSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PDF Links');
  if (!pdfSheet) {
    throw new Error('PDF Links sheet not found');
  }

  const existingBatchNumbers = pdfSheet.getRange('A:A').getValues().flat();
  const batchNumber = generateUniqueBatchNumberAdhoc(picklistGeneratedDate, existingBatchNumbers);

  

  


  const order_range = sheet_adhoc.getRange(2, 1, sheet_adhoc.getLastRow() - 1, 1); // Assumes order numbers are in the first column

  const existingOrderNumbers = order_range.getValues().map(row => row[0]);
  const orderNumberSet = new Set(existingOrderNumbers)
  console.log(orderNumberSet.size);

  // Filter new orders to only include those not in the spreadsheet
  const newOrders_1 = order_pending.filter(order => orderNumberSet.has(order.order_number));


  const namesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Actor Names');
  if (!namesSheet) {
    throw new Error('Names sheet not found');
  }

  // Assuming names are in the first column
  const namesRange = namesSheet.getRange(2, 1, namesSheet.getLastRow() - 1, 1);
  const namesData = namesRange.getValues();

  // Flatten the array of names
  const names = namesData.map(row => row[0]).filter(name => name.trim() !== '');

  // Fetch orders
  
  // Initialize data structures for names
  let assignments = names.map(name => ({ name, totalItems: 0, orders: [] }));

  // Sort orders by unique_items in descending order
  newOrders_1.sort((a, b) => b.unique_items - a.unique_items);

  // Assign orders to actors
  newOrders_1.forEach(order => {
    // Find the actor with the least total unique_items
    let minName = assignments.reduce((min, current) => {
      return (current.totalItems < min.totalItems) ? current : min;
    });

    // Assign the order to this actor and update totalItems
    minName.orders.push(order);
    minName.totalItems += order.unique_items;

    // Add the Actor key to the order
    order.actor = minName.name
    order.batchNumber=batchNumber;
  })


  


  const orders = newOrders_1;
  const range = sheet.getDataRange();
  const values = range.getValues();

  


  
  
  // Convert order data to a map for faster lookup

  if (orders.length){

    
    


    todaydate=getFormattedDate()




    file_name=`${todaydate}_${orders[0].order_number}_${orders[orders.length-1].order_number}`



    var picklist_html = generateCombinedInvoiceHTMLPicklist(orders);
  
    var picklist_blob = HtmlService.createHtmlOutput(picklist_html).getBlob().getAs('application/pdf');
    var picklist_file = DriveApp.createFile(picklist_blob);
    picklist_file.setName(`${file_name}_Picklist.pdf`);
    Logger.log('Combined PDF created: ' + picklist_file.getUrl());




    var invoice_html = generateCombinedInvoiceHTML(orders);
  
    var invoice_blob = HtmlService.createHtmlOutput(invoice_html).getBlob().getAs('application/pdf');
    var invoice_file = DriveApp.createFile(invoice_blob);
    invoice_file.setName(`${file_name}_Invoice.pdf`);
    Logger.log('Combined PDF created: ' + invoice_file.getUrl());

    const emails = [] // list the emails you want toi share the picklists and invoices
    picklist_file.getEditors().forEach(editor => {
      picklist_file.removeEditor(editor.getEmail());
    });
    picklist_file.getViewers().forEach(viewer => {
      picklist_file.removeViewer(viewer.getEmail());
    });

  // Set access for each specific email
    emails.forEach(email => {
      picklist_file.addViewer(email); 
    });


    invoice_file.getEditors().forEach(editor => {
      invoice_file.removeEditor(editor.getEmail());
    });
    invoice_file.getViewers().forEach(viewer => {
      invoice_file.removeViewer(viewer.getEmail());
    });

  // Set access for each specific email
    emails.forEach(email => {
      invoice_file.addViewer(email); 
    });

    const pdfUrl_picklist = picklist_file.getUrl();
    const pdfUrl_invoice=invoice_file.getUrl();
    const downloadUrl_picklist = "https://drive.google.com/uc?export=download&id=" + picklist_file.getId(); 
    const downloadUrl_invoice="https://drive.google.com/uc?export=download&id=" + invoice_file.getId();

    
    
    const pdf_sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PDF Links');
    if (!pdf_sheet) {
      // If no sheet found, create it and set headers
      const pdf_newSheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('PDF Links');
      pdf_newSheet.appendRow(['Piclist Download URL', 'Invoice Download URL','Picklist Generated','Number of Orders']);
    }

    // Append the PDF URL and picklist generated time to the sheet
    pdf_sheet.appendRow([batchNumber,downloadUrl_picklist,downloadUrl_invoice, picklistGeneratedDate,picklistGeneratedTime,orders.length,"ADHOC"]);


    orders.forEach((order, index) => {
      // Prepare the data row
      const row = [
        order.order_number || 'N/A',
        order.created_at || 'N/A',
        order.picklist_generated || 'N/A',
        "ADHOC",order.actor||'N/A',order.unique_items||'N/A',
        batchNumber,picklistGeneratedDate
      ];

      // Append the data row to the sheet
      sheet.appendRow(row);
    });

    
    }
  
}

function generateUniqueBatchNumberAdhoc(date, existingBatchNumbers) {
  // Find existing batch numbers for the current date
  const existingBatchNumbersForDate = existingBatchNumbers.filter(batch => batch.startsWith(`adhoc_${date}`));

  // Determine the next batch number
  const nextBatchNumber = existingBatchNumbersForDate.length + 1;

  // Combine date and batch number to form the unique batch number
  console.log(`${date}_${nextBatchNumber}`)
  return `adhoc_${date}_${nextBatchNumber}`;
}










function generateCombinedInvoiceHTMLPicklist(orders) {
  
  let html = `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 1px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 11px; } /* Decreased font size */
          th { background-color: #f2f2f2; }
          .no-border, .no-border th, .no-border td { border: none; }
          .company-info { font-size: 12px; vertical-align: top; }
          .company-logo { text-align: right; vertical-align: middle; }
          .page-break { page-break-after: always; }
          .address-heading { font-size: 16px; font-weight: bold; }
          .address { font-size: 14px; }
          .addresses { margin-bottom: 20px; }
          .addresses td { width: 50%; }
          .order-details { font-size: 12px; margin-bottom: 5px; }
          .footer-message { margin-top: 20px; font-size: 12px; text-align: center; text-align: left;}
        </style>
      </head>
      <body>`;

  orders.forEach((order,index) => {

    const orderDate = new Date(order.created_at);
    const currentDate = new Date();
    const timeDiff = currentDate.getTime() - orderDate.getTime();
    const daysDiff = timeDiff / (1000 * 3600 * 24);


    
    

    esc=""
    if(order.escalated){
      esc="★ESC★ "
    }

    
    
    let orderHeaderTitle = `${esc}Order Picklist: ${order.order_number || 'N/A'}`;
    

    const orderDetails = `Order Number: ${order.order_number}<br>` +
        `Order Amount: ${order.order_amount}<br>` +
        `Order Date: ${order.created_at}<br>` +
        `Picklist Date: ${order.picklist_generated}<br>` +
        `SLA: ${daysDiff.toFixed(2)} Days<br>`+
        `Gateway: ${order.payment_method}<br>` +
        `--------------------------------------------<br>` +
        `No of Items: ${order.unique_items}<br>`+
        `Batch Number: ${order.batchNumber}`;
    html += `
        <div class="order-section">
          <h1 style="text-align:center;">${orderHeaderTitle}</h1>
          
          <table class="addresses">
            <tr>
              <td>
                <div class="address-heading"><h2>Actor Name</h2></div>
                <div class="address"><h1>${order.actor}</h1></div>
              </td>
              <td>
                <div class="address-heading">Order Details</div>
                <div class="address">${orderDetails}</div>
              </td>
            </tr>
          </table>
          <table>
          <tr>
            <th style="font-size:14.5px">#</th>
            <th style="font-size:14.5px">Item</th>
              <th style="width:3.3rem;font-size:14.5px">SKU</th>
              <th style="font-size:14.5px">QTY</th>
              <th style="font-size:14.5px">Picking</th>
              <th style="font-size:14.5px">Packing</th>
          </tr>`;

    // order.line_items.sort((a, b) => a.sku.localeCompare(b.sku));
    order.line_items.sort((a, b) => (a.sku || '').localeCompare(b.sku || ''));
    order.line_items.forEach((item,idx) => {
   
      
    html += `
          <tr>
            <td style="font-size:13.5px">${idx+1}</td>
            <td style="font-size:13.5px">${item.name}</td>
            <td style="font-size:13.5px">${item.sku}</td>
            <td style="text-align: center;font-size:13.5px">${item.quantity}</td>
            <td style="text-align: center;font-size:13.5px">☐</td>
            <td style="text-align: center;font-size:13.5px">☐</td>
          </tr>`;
    });

    html +=`</table>`

    
    if (index < orders.length - 1) {
      html += '<div class="page-break"></div>';
    }
  });
    

  

  html += `
      </body>
    </html>`;
  return html;
}




function generateCombinedInvoiceHTML(orders) {
 

  let hsncodes = loadHSNCodes();
  let html = `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 1px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 11px; } /* Decreased font size */
          th { background-color: #f2f2f2; }
          .no-border, .no-border th, .no-border td { border: none; }
          .company-info { font-size: 12px; vertical-align: top; }
          .company-logo { text-align: right; vertical-align: middle; }
          .page-break { page-break-after: always; }
          .address-heading { font-size: 16px; font-weight: bold; }
          .address { font-size: 14px; }
          .addresses { margin-bottom: 20px; }
          .addresses td { width: 50%; }
          .order-details { font-size: 12px; margin-bottom: 5px; }
          .footer-message { margin-top: 20px; font-size: 12px; text-align: center; text-align: left;}
        </style>
      </head>
      <body>`;

  orders.forEach((order,index) => {
    
    html += `
        <div class="order-section">
          <table class="no-border">  <!-- Applied no-border class -->
            <tr>
              <td class="company-info">
                <strong>Shopfy Business Name</strong><br>
                Address line 1,<br>
                Address line 2,<br>
                Address line 3,<br>
                Address line 4,<br>
                Address line 5,<br>
                Email support<br>
                website<br>
                phone support<br>
              </td>
              <td class="company-logo">
                <img src="${base64Logo}" alt="Company Logo" width="250">
              </td>
            </tr>
          </table>
          <h1 style="text-align:center;">TAX INVOICE</h1>
          <div class="order-details">
            <strong>Order Number:</strong> ${order.order_number}<br>
            <strong>Order Date:</strong> ${(order.created_at)}
          </div>
          <table class="addresses">
            <tr>
              <td>
                <div class="address-heading">Billing Address</div>
                <div class="address">${formatAddress(order.billing_address.address1?order.billing_address:order.shipping_address)}</div>
              </td>
              <td>
                <div class="address-heading">Shipping Address</div>
                <div class="address">${formatAddress(order.shipping_address||order.billing_address)}</div>
              </td>
            </tr>
          </table>
          <table>
          <tr>
            <th>#</th>
            <th>Item</th>
              <th style="width:3rem;">SKU</th>
              <th>HSN</th>
              <th>QTY</th>
              <th>IGST</th>
              <th>Rate</th>
              <th>Total</th>
          </tr>`;

    // order.line_items.sort((a, b) => a.sku.localeCompare(b.sku));
    order.line_items.sort((a, b) => (a.sku || '').localeCompare(b.sku || ''));
    order.line_items.forEach((item,idx) => {
     
      let key = `${item.productId}_${item.variantId}`;
      
      let hsn = hsncodes[key] || '';
      html += `
          <tr>
            <td>${idx+1}</td>
            <td>${item.name}</td>
            <td>${item.sku}</td>
            <td>${hsn}</td>
            <td>${item.quantity}</td>
            <td>${item.tax_lines.length ? (item.tax_lines[0].rate*100).toString()+"%":'N/A'}</td>
            <td>${item.tax_lines.length ? ((item.price* item.quantity)/(1+item.tax_lines[0].rate)).toFixed(2).toString():'N/A'}</td>
            <td>${(item.price*item.quantity).toFixed(2).toString() ||'N/A'}</td>
          </tr>`;
    });

    discountStr=``;

    if (order.current_total_discounts!=='0.00'){
      discountStr=`<div style="display: flex; justify-content: space-between; align-items:center;">
                <h3 style="font-size:13px">DISCOUNTS:</h3>
                <p style="font-size:12px">-INR ${order.current_total_discounts}</p>
            </div>`
    }
    
    shippingStr=``;

    if ((order.shipping_lines).length){
      shippingStr=`<div style="display: flex; justify-content: space-between;align-items:center;">
                <h3 style="font-size:13px">SHIPPING:</h3>
                <p style="font-size:12px">INR ${order.shipping_lines[0].discounted_price}</p>
            </div>`
    }
    



    html += `
          </table>
          <div style="display: flex; justify-content: space-between; margin-top:10px;witdh:100%;">

        
        <div style="width:50%">
            <h3 style="font-size:13px">TOTAL ITEMS</h3>
            <p style="font-size:12px">${order.unique_items}</p>
        </div>
        <div style="width:26.5%">
            ${discountStr}
            <div style="display: flex; justify-content: space-between; align-items:center;margin-bottom: 1px;">
                <h3 style="font-size:13px">SUB TOTAL:</h3>
                <p style="font-size:12px">INR ${order.order_subtotal}</p>
            </div>
            ${shippingStr}
            <div style="display: flex; justify-content: space-between;align-items:center;margin-bottom: 1px;">
                <h3 style="font-size:13px">IGST:</h3>
                <p style="font-size:12px">INR ${order.order_tax}</p>
            </div>
            <hr/>
            <div style="display: flex; justify-content: space-between;align-items:center;margin-bottom: 1px;">
                <h3>TOTAL</h3>
                <p style="font-size: large;font-weight:bold">INR ${order.order_amount}</p>
            </div>
        </div>
        
    </div>
    <div class="footer-message">
            <strong>Thanks for your business.</strong><br>
            We truly appreciate your trust, and we'll do our best to continue to give you the service you deserve.<br>
            We look forward to serving you again.
          </div>
        </div>`;

    if (index < orders.length - 1) {
      html += '<div class="page-break"></div>';
    }
  });
    

  

  html += `
      </body>
    </html>`;
  return html;
}



function loadHSNCodes() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("hsnCode");
  const range = sheet.getDataRange();
  const values = range.getValues();
  
  let hsncodes = {};
  // Assuming your sheet has headers on the first row: ProductID, VariantID, HSNCode
  for (let i = 1; i < values.length; i++) {
    let productID = values[i][0];
    let variantID = values[i][1];
    let hsnCode = values[i][2] || ''; // Use an empty string if HSNCode is not present
    let key = `${productID}_${variantID}`;
    hsncodes[key] = hsnCode;
  }
  
  return hsncodes;
}









function extractGSTFromStrings(string1, string2) {
  
  var gstPattern = /\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]/;
  
  
  
  var match1 = string1.match(gstPattern);
  var match2 = string2.match(gstPattern);

  
  var gstNumber = "No GST Number Found";
  var newString1 = string1;
  var newString2 = string2;

  // Check each string for a GST number, extract it, and remove it from the original string
  if (match1) {
    gstNumber = match1[0];
    newString1 = string1.replace(gstNumber, '').trim(); // Remove GST and trim any extra spaces
  } if (match2) {
    gstNumber = match2[0];
    newString2 = string2.replace(gstNumber, '').trim(); // Remove GST and trim any extra spaces
  }

  
  return {
    gstNumber: "GST No: "+gstNumber,
    newString1: newString1,
    newString2: newString2
  };
}












function formatAddress(address) {
  gst=extractGSTFromStrings((address.address1||''),(address.address2||''))
  formatedAddress=`${address.name || ''}<br>${address.address1 || ''}${address.address2 ? ', ' + address.address2 : ''}<br>${address.city || ''}, ${address.province_code || ''} ${address.zip || ''}<br>${address.country || ''}<br>Phone: ${address.phone || 'N/A'}`;

  if (gst.gstNumber!=="GST No: No GST Number Found"){
    formatedAddress=`${address.name || ''}<br>${gst.gstNumber}<br>${gst.newString1 || ''}${address.address2 ? ', ' + gst.newString2 : ''}<br>${address.city || ''}, ${address.province_code || ''} ${address.zip || ''}<br>${address.country || ''}<br>Phone: ${address.phone || 'N/A'}`
  }
  
  return formatedAddress
}











function getFormattedDate() {
  var today = new Date();
  
  var timeZone = Session.getScriptTimeZone();
  
  var formattedDate = Utilities.formatDate(today, timeZone, "yyyy-MM-dd");
  
  
  Logger.log(formattedDate);
  return formattedDate;
}



function hsnCodeFunction() {
  // function to thrwo data of shopfyproductid-shopifyvariantid-hsncode map
 }



 function getAllShopifyfulfilledOrders() {
  let pageSize = 250;
  let currentDate = getTodaysDate()
  let pageUrl = `https://${shopify_admin_name}/admin/api/2022-10/orders.json?limit=250&created_at_min=${currentDate}&status=any`;
  let fetchMoreProduct = true;
  let allProducts = [];
  

  

  // Write the data to Google Sheets


  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName('Orders Data RAW');

  
  sheet.clearContents();


  while (fetchMoreProduct) {
    let shopifyResponse = getShopifyProductsByPageLink_sale(pageUrl);
    let products = shopifyResponse.productArray;
    pageUrl = shopifyResponse.nextPageUrl;
    fetchMoreProduct = products.length < pageSize || pageUrl.length === 0 ? false : true;
    allProducts = allProducts.concat(products);
    console.log(allProducts.length);

  }
  
  const headers = ['Order Number', 'Created At', 'Fulfillment Status', 'Cancelled At', 'Fulfilled At', 'Delivered At','status_delivered','tracking_company','tracking_url',	'Payment gateway','refund date'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  if (allProducts.length > 0) {
    const data = allProducts.map(order => {
      let deliveredAt = (order.fulfillments && order.fulfillments.length > 0) ? order.fulfillments[order.fulfillments.length-1].updated_at : '';
      let status_delivered=(order.fulfillments && order.fulfillments.length > 0) ? order.fulfillments[order.fulfillments.length-1].shipment_status : '';
      let fulfilled_at=(order.fulfillments && order.fulfillments.length > 0) ? order.fulfillments[order.fulfillments.length-1].created_at : '';
      let tracking_company=(order.fulfillments && order.fulfillments.length > 0) ? order.fulfillments[order.fulfillments.length-1].tracking_company : '';
      let tracking_url=(order.fulfillments && order.fulfillments.length > 0) ? order.fulfillments[order.fulfillments.length-1].tracking_url : '';
      return [order.order_number, 
              order.created_at, 
              order.fulfillment_status, 
              order.cancelled_at, 
              fulfilled_at, 
              deliveredAt,
              status_delivered,
              tracking_company,
              tracking_url,
              order.payment_gateway_names.length>0?order.payment_gateway_names[order.payment_gateway_names.length-1]:"",
              order.refunds.length?order.refunds[0].created_at:""];
    });
    
    if (data.length > 0) {
      sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
    }
  }


  //this function is used to append or update order data. The data can be further be used to define operations metrics
  appendOrderData()


 
}



function getTodaysDate() {
  var today = new Date();
  var yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 45);
  var year = yesterday.getFullYear();
  var month = yesterday.getMonth() + 1;
  var day = yesterday.getDate();

  
  var formattedDate = year + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day;

  return formattedDate;
}




function appendOrderData() {
  
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  
  var sourceSheet = spreadsheet.getSheetByName('Orders Data RAW');
  var targetSheet = spreadsheet.getSheetByName('Orders Data Filtered');

  
  var sourceData = sourceSheet.getDataRange().getValues();
  var targetData = targetSheet.getDataRange().getValues();

  var idColumnIndex = 0; 
  var existingIDs = {};

  
  for (var i = 1; i < targetData.length; i++) { 
    existingIDs[targetData[i][idColumnIndex]] = i; 
  }

  var rowsToUpdate = [];
  var rowsToAppend = [];

  for (var j = 1; j < sourceData.length; j++) { 
    var id = sourceData[j][idColumnIndex];
    if (existingIDs.hasOwnProperty(id)) {
      
      rowsToUpdate.push({row: existingIDs[id] + 1, values: sourceData[j]});
    } else {
      
      rowsToAppend.push(sourceData[j]);
    }
  }

  
  rowsToUpdate.forEach(function(item) {
    targetSheet.getRange(item.row, 1, 1, item.values.length).setValues([item.values]);
  });

  
  if (rowsToAppend.length > 0) {
    targetSheet.getRange(targetSheet.getLastRow() + 1, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
  }

  console.log("Script completed with " + rowsToUpdate.length + " updates and " + rowsToAppend.length + " new rows appended.");
}

 
