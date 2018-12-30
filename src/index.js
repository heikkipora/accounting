const fs = require('fs')
const path = require('path')
const program = require('commander')
const Promise = require('bluebird')

program
  .version(require(`${__dirname}/../package.json`).version)
  .option('--path <path>', 'Path to scan for PDFs')
  .parse(process.argv)

if (!program.path) {
  console.error(program.help())
  process.exit(1)
}

const readdirAsync = Promise.promisify(fs.readdir)
const writeFileAsync = Promise.promisify(fs.writeFile)

const fileNameRegex = /^[\d]{4}-[\d]{2}-[\d]{2}.*\.pdf$/
readdirAsync(program.path)
  .then(fileNames => fileNames.filter(fileName => fileNameRegex.test(fileName)).map(splitFilename))
  .then(splitIncomeAndExpense)
  .then(calculateTotals)
  .then(toHtml)
  .then(writeOutput)

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
  return {date, fileName, name, price, tax}
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
  return (cents / 100).toFixed(2)
}

function writeOutput(html) {
  const outputFile = path.resolve(program.path, 'index.html')
  return writeFileAsync(outputFile, html, 'utf8')
}

function formatDate(date) {
  return date.getDate() + "." + (date.getMonth() + 1) + "." + date.getFullYear()
}

function toHtml(data) {
  return `${HEAD}
  <table>
  <tr><th>Pvm</th><th>Aihe</th><th>Veroton</th><th>ALV</th></tr>
  ${rowsHtml(data.income)}
  ${rowsHtml(data.expenses)}
  </table>
  ${TAIL}`
}

function rowsHtml({rows}) {
  return rows.map(row => `<tr><td>${formatDate(row.date)}</td><td><a href="${encodeURIComponent(row.fileName)}" target="_blank">${row.name}</a></td><td>${toEuros(row.price)} €</td><td>${toEuros(row.tax)} €</td></tr>`).join('\n')
}

const HEAD = 
`<!doctype html>
<html lang="fi">
<head>
 <title>Kirjanpito 2018</title>
 <meta charset="utf-8">
 <meta http-equiv="x-ua-compatible" content="IE=edge">
 <style>
 * {
   font-family: sans-serif;
 }
 table {
  border-collapse: collapse;
 }
 th {
   text-align: left;
   background-color: rgb(242,242,242);
   margin: 0;
   padding: 4px 8px;
 }
 td {
  margin: 0;
  padding: 2px 8px;
 }
 th:nth-child(1), th:nth-child(3), th:nth-child(4),
 td:nth-child(1), td:nth-child(3), td:nth-child(4) { 
   text-align: right;
 }
 </style>
</head>
<body>
`
const TAIL = 
`</body>
</html>`