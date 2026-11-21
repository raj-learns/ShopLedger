var dates = require('./dates');
var pricing = require('./pricing');

function round2(n) {
  return Math.round((Number(n) + 1e-9) * 100) / 100;
}

function findCustomer(db, id) {
  if (!id || !db.customers) return null;
  for (var i = 0; i < db.customers.length; i++) {
    if (db.customers[i].id == id) return db.customers[i];
  }
  return null;
}

exports.findCustomer = findCustomer;

function getCustomerLedger(db, customerId) {
  var billed = 0;
  var settled = 0;
  var history = [];
  var orders = db.orders || [];

  for (var i = 0; i < orders.length; i++) {
    var order = orders[i];
    if (order.customerId != customerId || order.status === 'cancelled') continue;

    var totals = pricing.computeTotals(order.items || [], order.coupon);
    history.push({
      id: order.id,
      date: order.date,
      paymentMode: order.paymentMode || 'cash',
      status: order.status || 'completed',
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total
    });

    if (order.paymentMode === 'khata') billed = round2(billed + totals.total);
  }

  var settlements = db.settlements || [];
  for (var j = 0; j < settlements.length; j++) {
    if (settlements[j].customerId == customerId) {
      settled = round2(settled + Number(settlements[j].amount || 0));
    }
  }

  return { totalBilled: billed, totalSettled: settled, history: history };
}

exports.listCustomers = function (db) {
  return (db.customers || []).map(function (c) {
    var customerLedger = getCustomerLedger(db, c.id);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      type: c.type || 'Retail',
      gstin: c.gstin || '',
      creditLimit: c.creditLimit || 5000,
      openingBalance: c.openingBalance || 0,
      totalBilled: customerLedger.totalBilled,
      totalSettled: customerLedger.totalSettled,
      balance: round2((c.openingBalance || 0) + customerLedger.totalBilled - customerLedger.totalSettled),
      orderHistory: customerLedger.history
    };
  });
};

// Called when an order is placed with paymentMode === 'khata'
exports.chargeOrderToKhata = function (db, customerId, orderTotal) {
  var c = findCustomer(db, customerId);
  if (!c) return { ok: false, error: 'Customer account not found for Khata billing' };

  var customerLedger = getCustomerLedger(db, customerId);
  var currentBalance = round2((c.openingBalance || 0) + customerLedger.totalBilled - customerLedger.totalSettled);
  var projected = round2(currentBalance + Number(orderTotal));

  if (c.creditLimit && projected > c.creditLimit) {
    return {
      ok: false,
      error: 'Khata credit limit exceeded for ' + c.name + ' (Limit: ₹' + c.creditLimit + ', Projected: ₹' + projected.toFixed(2) + ')'
    };
  }

  c.totalBilled = round2((c.totalBilled || 0) + Number(orderTotal));
  c.balance = round2((c.openingBalance || 0) + c.totalBilled - (c.totalSettled || 0));
  return { ok: true, customer: c };
};

exports.reverseOrderDebit = function (db, customerId, orderTotal) {
  var c = findCustomer(db, customerId);
  if (!c) return;
  c.totalBilled = Math.max(0, round2((c.totalBilled || 0) - Number(orderTotal)));
  c.balance = round2((c.openingBalance || 0) + c.totalBilled - (c.totalSettled || 0));
};

// Records a customer payment settling their outstanding Khata balance
exports.recordSettlement = function (db, customerId, amount, mode, note) {
  var c = findCustomer(db, customerId);
  if (!c) return { ok: false, error: 'Customer not found' };
  amount = Number(amount);

  if (!amount || amount <= 0) {
    return { ok: false, error: 'Settlement amount must be greater than zero' };
  }

  // Keep the cached fields in step with the order and settlement ledgers.
  var customerLedger = getCustomerLedger(db, customerId);
  c.totalBilled = customerLedger.totalBilled;
  c.totalSettled = round2(customerLedger.totalSettled + amount);
  c.balance = round2((c.openingBalance || 0) + c.totalBilled - c.totalSettled);

  var entry = {
    id: db.nextSettlementId++,
    customerId: c.id,
    customerName: c.name,
    date: dates.today(),
    amount: Number(amount),
    mode: mode || 'upi',
    note: note || 'Khata settlement'
  };

  if (!db.settlements) db.settlements = [];
  db.settlements.unshift(entry);

  return {
    ok: true,
    settlement: entry,
    customer: c
  };
};
