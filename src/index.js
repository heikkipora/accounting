const fs = require('fs')
const program = require('commander')
const Promise = require('bluebird')

program
  .version(require(`${__dirname}/../package.json`).version)
  .option('--path <path>', 'Path to scan for PDFs')
  .option('--output <path>', 'Path to save a file to')
  .parse(process.argv)

if (!program.path || !program.output) {
  console.error(program.help())
  process.exit(1)
}

const readdirAsync = Promise.promisify(fs.readdir)

const fileNameRegex = /^[\d]{4}-[\d]{2}-[\d]{2}.*\.pdf$/
readdirAsync(program.path)
  .then(fileNames => fileNames.filter(fileName => fileNameRegex.test(fileName)).map(splitFilename))
  .then(splitIncomeAndExpense)
  .then(calculateTotals)
  .then(console.log)

function splitIncomeAndExpense(rows) {
  return {
    income: rows.filter(row => row.price > 0),
    expense: rows.filter(row => row.price < 0)  
  }
}

function calculateTotals({income, expense}) {
  const incomeTotal = income.reduce(accPrice, {total: 0, tax: 0})
  const expenseTotal = expense.reduce(accPrice, {total: 0, tax: 0})
  return {
    income: {
      totalNoVat: toEuros(incomeTotal.total),
      vat: toEuros(incomeTotal.tax),
      total: toEuros(incomeTotal.total + incomeTotal.tax),
      rows: income
    },
    expenses: {
      totalNoVat: toEuros(expenseTotal.total),
      vat: toEuros(expenseTotal.tax),
      total: toEuros(expenseTotal.total - expenseTotal.tax),
      rows: expense
    },
    totalNoVat: toEuros(incomeTotal.total + expenseTotal.total),
    vat: toEuros(incomeTotal.tax - expenseTotal.tax),
    total: toEuros(incomeTotal.total + incomeTotal.tax + expenseTotal.total - expenseTotal.tax)
  }
}

function splitFilename(fileName) {
  const [datePart, namePart, pricePart, taxPart] = fileName.split('|')
  const date = new Date(datePart)
  const name = namePart.trim()
  const price = toCents(Number(pricePart.trim().replace('€', '')))
  const tax = toCents(Number(taxPart.trim().replace('ALV', '').replace('€.pdf', '').trim()))
  if (isNaN(price) || isNaN(tax)) {
    console.error(`Failed to parse price or tax from ${fileName}`)
  }
  return {date, name, price, tax}
}

function accPrice(acc, item) {
  return {
    total: acc.total + item.price,
    tax: acc.tax + item.tax,
  }
}

function toCents(euros) {
  return euros * 100
}

function toEuros(cents) {
  return cents / 100
}