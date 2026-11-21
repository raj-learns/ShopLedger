var test = require('node:test');
var assert = require('node:assert/strict');

var seed = require('../data/db.json');
var invoice = require('../lib/invoice');
var inventory = require('../lib/inventory');
var orders = require('../lib/orders');
var ledger = require('../lib/ledger');

function cloneDb() {
  return JSON.parse(JSON.stringify(seed));
}

test('invoices use checkout HSN GST and capped SAVE10 discount', function () {
  var db = cloneDb();
  var order1002 = orders.get(db, 1002);
  var order1004 = orders.get(db, 1004);

  assert.deepEqual(
    { total: invoice.computeInvoiceFigures(order1002).total, tax: invoice.computeInvoiceFigures(order1002).tax },
    { total: 963.90, tax: 45.90 }
  );
  assert.equal(invoice.computeInvoiceFigures(order1004).total, 2194.50);
});

test('an order can consume final sellable stock and cancellation restocks once', function () {
  var db = cloneDb();
  var product = db.products.find(function (p) { return p.sku === 'DRY-001'; });
  var item = { id: product.id, qty: 1 };

  assert.equal(inventory.check(db.products, [item]).ok, true);
  inventory.reserve(db.products, [item]);
  assert.equal(product.stock, 0);

  var order = orders.add(db, {
    items: [item],
    total: 450,
    status: 'completed'
  });
  assert.equal(orders.cancel(db, order.id, 'test').ok, true);
  assert.equal(product.stock, 1);
  assert.equal(orders.cancel(db, order.id, 'test').ok, false);
  assert.equal(product.stock, 1);
});

test('Khata derives active order history and subtracts recorded payments', function () {
  var db = cloneDb();
  var kalyani = ledger.listCustomers(db).find(function (c) { return c.id === 5; });
  assert.equal(kalyani.totalBilled, 2194.50);
  assert.equal(kalyani.balance, 2194.50);
  assert.deepEqual(kalyani.orderHistory.map(function (o) { return o.id; }), [1004]);

  assert.equal(orders.cancel(db, 1004, 'test').ok, true);
  kalyani = ledger.listCustomers(db).find(function (c) { return c.id === 5; });
  assert.equal(kalyani.totalBilled, 0);
  assert.equal(kalyani.balance, 0);
  assert.deepEqual(kalyani.orderHistory, []);

  var before = ledger.listCustomers(db).find(function (c) { return c.id === 1; }).balance;
  assert.equal(ledger.recordSettlement(db, 1, 100, 'cash', 'test').ok, true);
  var after = ledger.listCustomers(db).find(function (c) { return c.id === 1; }).balance;
  assert.equal(after, before - 100);
});
