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
    expense: rows.filter(row => row.price < 0),
    rows
  }
}

function calculateTotals({income, expense, rows}) {
  const incomeTotal = income.reduce(accPrice, {total: 0, tax: 0})
  const expenseTotal = expense.reduce(accPrice, {total: 0, tax: 0})
  const expenseTotalEU = expense.filter(({isEU}) => isEU).reduce(accPrice, {total: 0, tax: 0})
  return {
    income: {
      totalNoVat: toEuros(incomeTotal.total),
      vat: toEuros(incomeTotal.tax),
      total: toEuros(incomeTotal.total + incomeTotal.tax)
    },
    expenses: {
      totalNoVat: toEuros(-expenseTotal.total),
      vat: toEuros(expenseTotal.tax),
      total: toEuros(-(expenseTotal.total - expenseTotal.tax)),
      vatEU: toEuros(expenseTotalEU.tax)
    },
    rows,
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
  const isEU = namePart.indexOf('(EU)') >= 0
  if (isNaN(price) || isNaN(tax)) {
    console.error(`Failed to parse price or tax from ${fileName}`)
  }
  return {date, fileName, name, price, tax, isEU}
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
  return (cents / 100).toFixed(2).replace('.', ',') + ' €'
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
  <h2>Kirjanpito 2018</h2>
  <table>
    <tr><th>Pvm</th><th>Selite</th><th>Tulo</th><th>Meno</th><th>ALV</th></tr>
    ${rowsHtml(data)}
  </table>

  <h2>Yhteenveto ALV-ilmoitukseen</h2>
  <p>Vero kotimaan myynnistä (24%): ${data.income.vat}</p>
  <p>Vero palveluostoista muista EU-maista: ${data.expenses.vatEU}</p>
  <p>Verokauden vähennettävä vero: ${data.expenses.vat}</br>
     Alarajahuojennukseen oikeuttava liikevaihto: ${data.totalNoVat}</br>
     Alarajahuojennukseen oikeuttava vero: ${data.vat}</br>
     Alarajahuojennuksen määrä: ${data.vat}</p>

  <h2>Yhteenveto veroilmoitukseen</h2>
  <p>Liikevaihto / tuotot ammatista yhteensä: ${data.income.totalNoVat}</p>
  <p>Saadut avustukset ja tuet: ${data.income.vat}</p>
  <p>Elinkeinotoiminnan veronalaiset tuotot yhteensä: ${data.income.total}</p>
  <p>Muut vähennyskelpoiset kulut: ${data.expenses.total}</p>
  <p>Elinkeinotoiminnan tulos: ${data.total}</p>
  ${TAIL}`
}

function rowsHtml({rows}) {
  return rows.map(row => `<tr><td>${formatDate(row.date)}</td><td><a href="${encodeURIComponent(row.fileName)}" target="_blank">${row.name}</a></td><td>${row.price > 0 ? toEuros(row.price) : ''}</td><td>${row.price < 0 ? toEuros(-row.price) : ''}</td><td>${row.tax > 0 ? toEuros(row.tax) : ''}</td></tr>`).join('\n')
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
 td, th {
   border: 1px solid rgb(220,220,220);
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
 th:nth-child(1), th:nth-child(3), th:nth-child(4), th:nth-child(5),
 td:nth-child(1), td:nth-child(3), td:nth-child(4), td:nth-child(5) {
   text-align: right;
 }
 </style>
</head>
<body>
`
const TAIL = 
`</body>
</html>`