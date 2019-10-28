const csv = require('csvtojson');
const docsGenerator = require('./docsGenerator');
const moment = require('moment');
const dotty = require('dotty');
const fs = require('fs');
const fse = require('fs-extra');
const _ = require('lodash');
const path = require('path');

const args = process.argv.slice(2);
const csvSprinkleFilePath = args[0];
const csvMixPanelFilePath = args[1];
const actionDateStr = args[2];
const companyName = args[3];
const excludeDatesPath = args[4] || path.join(path.dirname(csvSprinkleFilePath),'exclude.json');
const actionDate = new Date(actionDateStr);

const excludedDates = fs.existsSync(excludeDatesPath) ? fse.readJsonSync(excludeDatesPath) : [];

if(args[4] && !fs.existsSync(excludeDatesPath)){
    console.error("given exclude file don't exist : ", excludeDatesPath);
}

if(!_.isArray(excludedDates)){
    console.error("given exclude file is not an array : ", excludeDatesPath);
} else {
    console.log("excluded dates ", excludedDates)
}


const excludedDatesSet = new Set();
excludedDates.forEach(date => excludedDatesSet.add((new Date(date)).getTime()));

const ONE_DAY_IN_MS = 1000 * 60 * 60 * 24;


// function getDateObj(str) {
//     const arr = str.split('-');
//     return (new Date(arr[2], Number(arr[1]) - 1, arr[0]));
// }

function dateDiff(d1, d2){
    return (d2.getTime() - d1.getTime())/ONE_DAY_IN_MS;
}

async function f() {
    const data = (await csv().fromFile(csvSprinkleFilePath)).map(row => {
        return {
            buyer_seller_new_rep: row.buyer_seller_new_rep,
            order_date: (new Date(row.order_date)),
            buyer_count: Number(row.buyer_count),
            total_gsv: Number(row['total gmv'])
        }
    });

    const mixPanelCsvString = fs.readFileSync(csvMixPanelFilePath, 'utf8');
    // console.log(mixPanelCsvString);
    const uniqueDates = new Set;

    const abc = data.filter(row => {
        const diff = dateDiff(row.order_date, actionDate);
        return (diff <= 30  && diff > 0 && !excludedDatesSet.has(row.order_date.getTime()));
    }).map(row => {
        uniqueDates.add(row.order_date.getTime());
        return row.total_gsv;
    });

    // console.log(abc.length);
    // console.log(uniqueDates.size);
    const val = {
        newGMV: dotty.get(data.find((row => dateDiff(actionDate, row.order_date) === 0 && row.buyer_seller_new_rep === 'New')),'total_gsv') || 0,
        repeatGMV: dotty.get(data.find((row => dateDiff(actionDate, row.order_date) === 0 && row.buyer_seller_new_rep === 'Repeat')),'total_gsv') || 0,
        newBuyerCount: dotty.get(data.find((row => dateDiff(actionDate, row.order_date) === 0 && row.buyer_seller_new_rep === 'New')),'buyer_count') || 0,
        repeatBuyerCount: dotty.get(data.find((row => dateDiff(actionDate, row.order_date) === 0 && row.buyer_seller_new_rep === 'Repeat')),'buyer_count') || 0,
        bauGMV: Math.round(abc.reduce((a, b) => a + b, 0)/uniqueDates.size),
        companyName,
        uniqueImpressions: Number(mixPanelCsvString.split('\n')[1].split(',')[1]),
        totalClicks: Number(mixPanelCsvString.split('\n')[2].split(',')[1]),
        uniqueClicks: Number(mixPanelCsvString.split('\n')[3].split(',')[1]),
        dateStr: moment(actionDate.getTime()).format('Do MMM YYYY')
    };
    val.ctr = Math.round((val.totalClicks/val.uniqueImpressions) * 10000) / 100;
    val.totalGMV = val.newGMV + val.repeatGMV;
    val.impact = val.totalGMV - val.bauGMV;
    val.impactFactor = Math.round((val.totalGMV/val.bauGMV)*100)/100;

    ['totalGMV', 'bauGMV'].forEach(key => {
        val[key] = (val[key]).toLocaleString("en-GB",{style:"currency",currency:"INR",maximumFractionDigits:0, minimumFractionDigits: 0});
    });
    ['uniqueImpressions', 'totalClicks', 'uniqueClicks'].forEach(key => {
        val[key] = (val[key]).toLocaleString("en-GB");
    });
    console.log(val);
    docsGenerator(val);
}

// f().then(res => console.log(res));
f();
