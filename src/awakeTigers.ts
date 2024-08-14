
import * as fs from 'fs';
import { Command } from 'commander';
import { XMLParser, XMLBuilder, XMLValidator } from "fast-xml-parser";
import { DateTime } from 'luxon'
import iconv from 'iconv-lite'
import HTMLParser from 'node-html-parser';

export class AwakeTiger2 {
    inputPath: string
    quarterCurrent: string
    quarterPreYear: string
    reportNameRegex: RegExp;
    output: string;
    outputForCode: string;

    constructor(inputPath: string = '', outputPath: string = '', quarterCurrent: string | null = null, quarterPreYear: string | null = null) {
        this.inputPath = inputPath
        this.reportNameRegex = /: (.*?기보고서|.*?재무제표기준|영업|매출액또는손익구조)/
        this.output = (outputPath) ? outputPath : './output.html'
        this.outputForCode = './stockcode.json'
        const qstrs = this._getQuaterStrings(quarterCurrent, quarterPreYear);

        this.quarterCurrent = qstrs.quarterCurrent // '2023.3Q'
        this.quarterPreYear = qstrs.quarterPreYear //'2022.3Q'
    }

    async readAndParseInput() {
        try {
            const codeData = await fs.promises.readFile(this.outputForCode, 'utf8')
            const codeObj = JSON.parse(codeData)

            const data = await fs.promises.readFile(this.inputPath, 'utf8')
            const table = this._parseToJson(data, codeObj)
            await fs.promises.writeFile(this.output, table, 'utf8')
        } catch (err) {
            return console.error('Error reading file:', err);
        }
    }
    async readStockCodeList(inputPath) {
        try {
            const data = await fs.promises.readFile(inputPath)
            const utf8Data = iconv.decode(data, 'euc-kr')
            const jObj = this._parseToJsonForCode(utf8Data)
            await fs.promises.writeFile(this.outputForCode, JSON.stringify(jObj, null, 2), 'utf8')
        } catch (err) {
            return console.error('Error reading file:', err);
        }
    }

    _parseToJson(data: string, codeObj: any): any {
        const tableArr: any = ['<table>']
        const root = HTMLParser.parse(data)
        const trs = root.querySelectorAll('div.body')
        const messages = root.querySelectorAll('.text')

        let resCount = 0
        const messagesLen = messages.length;
        for (let i = 1; i < messagesLen; i++) {
            const message = messages[i].innerHTML.trim().split('<br>');
            if (this._checkRevenueAndProfit(message)) {
                // output format
                resCount++
                tableArr.push(this._outputTr(message, resCount, codeObj))
            }
        }
        tableArr.push('</table>')
        return tableArr.join('')
    }

    _parseToJsonForCode(data: string): any {
        const res: any = {}
        const root = HTMLParser.parse(data)
        const trs = root.querySelectorAll('tr')
        const trsLen = trs.length;
        for (let i = 1; i < trsLen; i++) {
            const tr = trs[i];
            const tds = tr.querySelectorAll('td')
            const corpName = tds[0].textContent
            const corpCode = tds[1].textContent
            res[corpName] = corpCode
        }
        return res
    }

    _getQuaters(texts: string[], quarters: string[]): { [key: string]: string[] } | null {
        const res: any = {}
        const textsLen = texts.length;

        if (!this.reportNameRegex.test(texts[2])) {
            console.log(texts[1])
            return null
        }
        for (let i = 0; i < textsLen; i++) {
            const line = texts[i];
            const quartersLen = quarters.length;
            for (let j = 0; j < quartersLen; j++) {
                if (line.startsWith(quarters[j])) {
                    res[quarters[j]] = line.split(/[ /]/).filter(v => v !== '')
                    break
                }
            }
        }
        return res
    }

    _getQuaterStrings(quarterCurrent: string | null = null, quarterPreYear: string | null = null)
        : { quarterCurrent: string, quarterPreYear: string } {
        if (quarterCurrent != null && quarterPreYear != null) {
            return {
                quarterCurrent,
                quarterPreYear
            }
        }
        let quarter
        const now = new Date();
        let year = now.getFullYear()
        let month = now.getMonth()
        if (month >= 0 && month <= 2) {
            year -= 1
            quarter = '4Q';
        } else if (month >= 3 && month <= 5) {
            quarter = '1Q';
        } else if (month >= 6 && month <= 8) {
            quarter = '2Q';
        } else if (month >= 9 && month <= 11) {
            quarter = '3Q';
        }
        return {
            quarterCurrent: `${year}.${quarter}`,
            quarterPreYear: `${year - 1}.${quarter}`
        };
    }
    _getNumber(text: string) {
        return Number(text.replace(/[^\-0-9]/g, ''))
    }

    _checkRevenueAndProfit(textLines: string[]) {
        const qvalues = this._getQuaters(textLines, [this.quarterCurrent, this.quarterPreYear])
        if (!qvalues || Object.keys(qvalues).length <= 0) {
            return false
        }

        const REVENUE = 1
        const PROFIT = 2
        if (this._getNumber(qvalues[this.quarterCurrent][REVENUE]) - this._getNumber(qvalues[this.quarterPreYear][REVENUE]) > 0
            && this._getNumber(qvalues[this.quarterCurrent][PROFIT]) - this._getNumber(qvalues[this.quarterPreYear][PROFIT]) > 0) {
            return true
        }
        return false
    }

    _genStockCodeObj(data: { td: any }[]): any {
        const stockCodes = {}
        const COMPANYNAME = 0
        const STOCKCODE = 1
        const dataLen = data.length;
        for (let i = 1; i < dataLen; i++) {
            const tr = data[i];
            stockCodes[tr.td[COMPANYNAME]] = tr.td[STOCKCODE]['#text']
        }
        return stockCodes
    }


    _outputTr(
        textLines: string[],
        no: number,
        codeObj: any
    ) {

        const resGroup = /:\s*(.*?)\(/.exec(textLines[1])
        // https://m.stock.naver.com/domestic/stock/065350/news/title
        let newsLink = 'none'
        if (resGroup) {
            const corpCode = codeObj[resGroup[1]]
            newsLink = `<a href="https://m.stock.naver.com/domestic/stock/${corpCode}/news/title">${corpCode}</a>`
        }

        const trStr = `<tr>`
            + `<td class='no'>${no}</td>`
            + `<td class='date'>${textLines[0]}</td>`
            + `<td class='company'>${textLines[1]}</td>`
            + `<td class='report_type'>${textLines[2]}</td>`
            + `<td class='date'><pre>${textLines.slice(3, -2).join('\n')}</pre></td>`
            + `<td class='link'>${textLines[textLines.length - 1]}</td>`
            + `<td class='news-link'>${newsLink}</td>`
            + `</tr>`
        return trStr
    }
}

export default {
    AwakeTiger2
}