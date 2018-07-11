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
  .then(fileNames => fileNames.filter(fileName => fileNameRegex.test(fileName))
                              .map(splitFilename)
  )
  .then(rows => ({
    income: rows.filter(row => row.price > 0),
    expense: rows.filter(row => row.price < 0)
  }))
  .then(({income, expense}) => ({
    incomeTotal: income.reduce(accPrice, {price: 0, tax: 0}),
    expenseTotal: expense.reduce(accPrice, {price: 0, tax: 0}),
    income,
    expense
  }))
  .then(results => console.log(results))

function splitFilename(fileName) {
  const [datePart, namePart, pricePart, taxPart] = fileName.split('|')
  const date = new Date(datePart)
  const name = namePart.trim()
  const price = Number(pricePart.trim().replace('€', ''))
  const tax = Number(taxPart.trim().replace('ALV', '').replace('€.pdf', '').trim())
  return {date, name, price, tax}
}

function accPrice(acc, item) {
  return {
    price: acc.price + item.price,
    tax: acc.tax + item.tax,
  }
}