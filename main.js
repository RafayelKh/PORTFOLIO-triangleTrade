const Binance = require('node-binance-api');
const binance = new Binance().options({
  APIKEY: 'YOUR_KEY',
  APISECRET: 'YOUR_SECRET',
  recvWindow: 10000
});

let balance = 1
let regexForBTC = new RegExp('BTC$');
let regexForUSDT = new RegExp('USDT$');
let currentPrices
let verifiedPair = {};
let exchangeInfos = {};

let mainInterval;

// let check = async () => {
//     let currentPrices = await binance.prices();
//     console.info(currentPrices);
// }
let timeConverter = (UNIX_timestamp) => {
  var a = new Date(UNIX_timestamp);
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var year = a.getFullYear();
  var month = months[a.getMonth()];
  var date = a.getDate();
  var hour = a.getHours();
  var min = a.getMinutes();
  var sec = a.getSeconds();
  var time = date + ' ' + month + ' ' + year + ' ' + hour + ':' + min + ':' + sec ;
  return time;
}

let getTickSize = (asset, quote, quantity) => {
  // console.log(exchangeInfos[asset + quote]);

  if (exchangeInfos[asset + quote].filters[2].stepSize.split('.')[1].split('1')[0].length == 8) {
    console.log(quantity);
    return parseInt(quantity)
  } else {
    console.log(Number(Number(quantity).toFixed(exchangeInfos[asset + quote].filters[2].stepSize.split('.')[1].split('1')[0].length + 1)));
    return Number(Number(quantity).toFixed(exchangeInfos[asset + quote].filters[2].stepSize.split('.')[1].split('1')[0].length + 1))
  }
}

let calculateSpreads = (balance, priceOf_X_USDT, priceOf_X_BTC, priceOf_BTC_USDT) => {
  // default | USDT -> X -> BTC -> USDT
  // reverse | USDT -> BTC -> X -> USDT

  let defaultProfit = ((balance / priceOf_X_USDT) * priceOf_X_BTC) * priceOf_BTC_USDT
  let reverseProfit = ((balance / priceOf_BTC_USDT) / priceOf_X_BTC) * priceOf_X_USDT
  let profit = defaultProfit > reverseProfit ? defaultProfit : reverseProfit;
  let type = defaultProfit > reverseProfit ? 'default' : 'reverse';
  let netIncome = profit - (profit / 100 * 0.3);

  return {
    type,
    profit,
    netIncome
  }
}

let processTrade = async (asset) => {
  currentPrices = await binance.prices();

  console.log('\n-- Rechecking spread and profit -- \n')

  let spreads = calculateSpreads(balance, currentPrices[asset.token + 'USDT'], currentPrices[asset.token + 'BTC'], currentPrices['BTCUSDT']);
 
  console.log(spreads);
  console.log((balance / currentPrices[asset.token + 'USDT']));
  console.log((balance / currentPrices[asset.token + 'USDT']) * currentPrices[asset.token + 'BTC']);
  console.log(((balance / currentPrices[asset.token + 'USDT']) * currentPrices[asset.token + 'BTC']) * currentPrices['BTCUSDT']);


  console.log('Estimated BTCUSDT price - ', currentPrices['BTCUSDT']);
  console.log(`Estimated ${asset.token}USDT price - `, currentPrices[asset.token + 'USDT']);
  console.log(`Estimated ${asset.token}BTC price - `, currentPrices[asset.token + 'BTC'], '\n');

  console.log('Initial balance (USDT) - ', Number(balance));
  console.log('Estimated Net Income - ',  Number(spreads.netIncome) - Number(balance));
  console.log('Estimated Final Balance - ', Number(spreads.netIncome));


  if (spreads.netIncome - balance > (balance * 0.01)) {
    if (asset.type === 'default') {
      console.log(`\n-- Performing USDT -> ${asset.token} -- \n`);

      let XTokenQuantity = parseFloat(balance) / Number(currentPrices[asset.token + "USDT"]);
      let XTokenExecutedQuantity;

      binance.marketBuy(asset.token + "USDT", getTickSize(asset.token, 'USDT', XTokenQuantity), { type: "MARKET" }, (error, response) => {
        if (error) {
          console.error(error);
        } else {
          console.log(`\n-- Success USDT -> ${asset.token} -- \n`);
          XTokenExecutedQuantity = response.executedQty;

          console.log(`${asset.token} Executed Quantity - `, XTokenExecutedQuantity);

          let BTCExecutedQuantity;
          console.log(`\n-- Performing ${asset.token} -> BTC -- \n`);

          binance.marketSell(asset.token + "BTC", getTickSize(asset.token, 'BTC', XTokenExecutedQuantity), { type: "MARKET" }, (error, response) => {
            if (error) {
              console.error(error);
            } else {

              console.log(`\n-- Success ${asset.token} -> BTC -- \n`);
              BTCExecutedQuantity = response.cummulativeQuoteQty;

              console.log(`BTC Executed Quantity - `, BTCExecutedQuantity);

              let usdtExecutedQuantity;

              console.log(`\n-- Performing BTC -> USDT -- \n`);

              binance.marketSell("BTCUSDT", getTickSize('BTC', 'USDT', BTCExecutedQuantity), { type: "MARKET" }, (error, response) => {
                if (error) {
                  console.error(error);
                } else {
                  console.log(`\n-- Success BTC -> USDT -- \n`);

                  usdtExecutedQuantity = response.cummulativeQuoteQty;

                  console.log(`USDT Executed Quantity - `, usdtExecutedQuantity);

                  verifiedPair = {}
                }

                console.log(asset.token + " - ", XTokenExecutedQuantity);
                console.log("BTC amount -", BTCExecutedQuantity);
                console.log('Final balance (USDT) - ', usdtExecutedQuantity);
                console.log('------------------------------------------------------');
              })
            }
          })
        }
      })
    } else if (asset.type === 'reverse') {
      console.log(`\n-- Performing USDT -> BTC -- \n`);

      let btcQuantity = Number(balance) / Number(currentPrices['BTCUSDT']);
      let BTCExecutedQuantity;

      binance.marketBuy("BTCUSDT", getTickSize('BTC', 'USDT', btcQuantity), { type: "MARKET" }, (error, response) => {
        if (error) {
          console.error(error);
        } else {
          console.log(`\n-- Success USDT -> BTC -- \n`);
          BTCExecutedQuantity = response.executedQty;

          console.log(`BTC Executed Quantity - `, BTCExecutedQuantity);

          let XTokenQuantity = Number(BTCExecutedQuantity) / Number(currentPrices[asset.token + 'BTC']);
          let XTokenExecutedQuantity;

          console.log(`\n-- Performing BTC -> ${asset.token} -- \n`);

          binance.marketBuy(asset.token + "BTC", getTickSize(asset.token, 'BTC', XTokenQuantity), { type: "MARKET" }, (error, response) => {
            if (error) {
              console.error(error);
            } else {

              console.log(`\n-- Success BTC -> ${asset.token} -- \n`);

              XTokenExecutedQuantity = response.executedQty;

              console.log(`${asset.token} Executed Quantity - `, XTokenExecutedQuantity);

              let usdtExecutedQuantity;

              binance.marketSell(asset.token + "USDT", getTickSize(asset.token, 'USDT', XTokenExecutedQuantity), { type: "MARKET" }, (error, response) => {
                if (error) {
                  console.error(error);
                } else {
                  console.info(response);
                  usdtExecutedQuantity = response.cummulativeQuoteQty;

                  console.log(`USDT Executed Quantity - `, XTokenExecutedQuantity);

                  verifiedPair = {}
                }

                console.log(asset.token + " amount - ", XTokenExecutedQuantity);
                console.log("BTC amount -", BTCExecutedQuantity);
                console.log('Final balance - ', usdtExecutedQuantity);
                console.log('------------------------------------------------------');
              })
            }
          })
        }
      })

    } else {
      console.log("\n-- Spread is not enough for current trade --\n");
    }
  }
}

let getRawData = async (listOfPrices) => {
  let result = []
  let profits = []
  for (let elem of Object.keys(listOfPrices)) {
    if (regexForBTC.test(elem)) {
      if (!result.includes(elem.split(regexForBTC)[0])) {
        if (Object.keys(listOfPrices).includes(elem.split(regexForBTC)[0] + 'USDT')) {
          result.push(elem.split(regexForBTC)[0])
        }
      }
    }

    if (regexForUSDT.test(elem)) {
      if (!result.includes(elem.split(regexForUSDT)[0])) {
        if (Object.keys(listOfPrices).includes(elem.split(regexForUSDT)[0] + 'BTC')) {
          result.push(elem.split(regexForUSDT)[0])
        }
      }
    }
  }



  for (let token of result) {
    let results = calculateSpreads(balance, currentPrices[token + 'USDT'], currentPrices[token + 'BTC'], currentPrices['BTCUSDT'])

    profits.push({
      token,
      type: results.type,
      profit: results.profit,
      netIncome: results.netIncome
    })
  }
  profits = profits.sort((a, b) => b.profit - a.profit);

  let delay = 0;
  const delayIncrement = 500;
  let isAlreadyFound = false;

  let promises = profits.map((item, index) => {
    if (!isAlreadyFound) {
      delay += delayIncrement;
      return new Promise((resolve, reject) => {

        setTimeout(() => {
          binance.depth(`${item.token}USDT`, (USDTerror, USDTPairdepth, ToUSDTsymbol) => {
            if (USDTerror) {
              console.error(USDTerror);
              reject(USDTerror);
            }

            if (!(Object.keys(USDTPairdepth.asks).length === 0 || Object.keys(USDTPairdepth.bids).length === 0)) {
              binance.depth(`${item.token}BTC`, (BTCerror, BTCPairdepth, ToBTCsymbol) => {
                if (BTCerror) {
                  console.error(BTCerror);
                  reject(BTCerror);
                }

                if (!(Object.keys(BTCPairdepth.asks).length === 0 || Object.keys(BTCPairdepth.bids).length === 0)) {
                  if (item.netIncome - balance > (balance * 0.01)) {
                    if (item.type === 'reverse') {
                      if (Object.keys(verifiedPair).length == 0) {
                        verifiedPair = {
                          token: ToBTCsymbol.split(regexForBTC)[0],
                          type: item.type,
                          netIncome: item.netIncome,
                          profit: item.profit,
                          diff: item.netIncome - balance
                        }
  
                        console.log(verifiedPair);
  
                        processTrade(verifiedPair);
                      }
                    }

                    isAlreadyFound = true;
                  }
                }
              });
            }
          });
        }, delay);

        if (index === profits.length - 1) {
          resolve(verifiedPair);
        }
      })
    } else {
      resolve(verifiedPair);
    }
  })

  Promise.all(promises).then(() => {
    verifiedPair = verifiedPair.sort((a, b) => b.profit - a.profit);

    console.log('------------------------------------------------------');
  })
}

mainInterval = setInterval(async () => {
  let time = timeConverter(Date.now())
  console.log(`Checking for pairs with spread - ${time}`);
  let exchangeInfosRaw = await binance.exchangeInfo();

  exchangeInfosRaw.symbols.map((item, index) => {
    exchangeInfos[item.symbol] = item;
  })

  let balanceRaw = await binance.balance();
  balance = Number(balanceRaw.USDT.available) - 2;
  currentPrices = await binance.prices();

  await getRawData(currentPrices)
}, 60000) // every minute


// (async () => {
//   let exchangeInfosRaw = await binance.exchangeInfo();

//   exchangeInfosRaw.symbols.map((item, index) => {
//     exchangeInfos[item.symbol] = item;
//   })

//   let balanceRaw = await binance.balance();
//   balance = Number(balanceRaw.USDT.available) - 2;
//   currentPrices = await binance.prices();

//   await getRawData(currentPrices)
// })()