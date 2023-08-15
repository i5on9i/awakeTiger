
import * as fs from 'fs';
import { Command } from 'commander';
import { XMLParser, XMLBuilder, XMLValidator } from "fast-xml-parser";
import { DateTime } from 'luxon'
import iconv from 'iconv-lite'
import { AwakeTiger2 } from './awakeTigers';


class AwakeTiger {
    inputPath: string
    quaterCurrent: string
    quarterPreYear: string
    reportNameRegex: RegExp;
    output: string;
    outputForCode: string;

    constructor(inputPath: string = '') {
        this.inputPath = inputPath
        this.reportNameRegex = /: (.*?보고서|.*?재무제표기준|영업|매출액또는손익구조)/
        this.output = './output.html'
        this.outputForCode = './stockcode.json'
        this.quaterCurrent = '2023.2Q'
        this.quarterPreYear = '2022.2Q'
    }

    async readAndParseInput() {
        try {
            const codeData = await fs.promises.readFile(this.outputForCode, 'utf8')
            const codeObj = JSON.parse(codeData)

            const data = await fs.promises.readFile(this.inputPath, 'utf8')
            const jObj = this._parseToJson(data)
            const parsed = this._parse(jObj, codeObj)
            const html = this._buildHtml(parsed)
            await fs.promises.writeFile(this.output, html, 'utf8')
        } catch (err) {
            return console.error('Error reading file:', err);
        }
    }
    async readStockCodeList(inputPath) {
        try {
            const data = await fs.promises.readFile(inputPath)
            const utf8Data = iconv.decode(data, 'euc-kr')
            const jObj = this._parseToJson(utf8Data)
            const parsedObj = this._parseForCode(jObj)
            await fs.promises.writeFile(this.outputForCode, JSON.stringify(parsedObj, null, 2), 'utf8')
        } catch (err) {
            return console.error('Error reading file:', err);
        }
    }

    _parseToJson(data: string): any {
        const parsingOptions = {
            ignoreAttributes: false,
            // preserveOrder: true,
            unpairedTags: ["hr", "br", "link", "meta"],
            stopNodes: ["*.pre", "*.script"],
            processEntities: true,
            htmlEntities: true
        };
        const parser = new XMLParser(parsingOptions);
        let jObj = parser.parse(data);
        return jObj
    }
    _buildHtml(data: any) {
        const builderOptions = {
            ignoreAttributes: false,
            format: true,
            // preserveOrder: true,
            suppressEmptyNode: true,
            unpairedTags: ["hr", "br", "link", "meta"],
            stopNodes: ["*.pre", "*.script"],
        }
        const builder = new XMLBuilder(builderOptions);
        const output = builder.build(data);
        return output
    }

    _getQuaters(texts: string[], quarters: string[]): { [key: string]: string[] } | null {
        const res: any = {}
        const textsLen = texts.length;

        if (!this.reportNameRegex.test(texts[1])) {
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

    _getNumber(text: string) {
        return Number(text.replace(/[^0-9]/g, ''))
    }

    _checkRevenueAndProfit(jObj: { br: any[], a: any }) {
        const qvalues = this._getQuaters(jObj.br, [this.quaterCurrent, this.quarterPreYear])
        if (!qvalues || Object.keys(qvalues).length <= 0) {
            return false
        }

        const REVENUE = 1
        const PROFIT = 2
        if (this._getNumber(qvalues[this.quaterCurrent][REVENUE]) - this._getNumber(qvalues[this.quarterPreYear][REVENUE]) > 0
            && this._getNumber(qvalues[this.quaterCurrent][PROFIT]) - this._getNumber(qvalues[this.quarterPreYear][PROFIT]) > 0) {
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

    _outputTd(
        dataEl: { br: any, a: any, '#text': string, '@_class': string },
        no: number,
        codeObj: any
    ) {
        const resGroup = /:\s*(.*?)\(/.exec(dataEl.br[0])
        return {
            td: [
                { '@_class': 'no', '#text': no },
                { '@_class': dataEl['@_class'], '#text': dataEl['#text'] },
                { '@_class': 'company', '#text': dataEl.br[0] },
                { '@_class': 'report_type', '#text': dataEl.br[1] },
                { pre: dataEl.br.slice(2, -1).join('\n') },
                {
                    div: {
                        '#text': dataEl.br[dataEl.br.length - 1],
                        a: dataEl.a
                    }
                },
                { '#text': (resGroup) ? codeObj[resGroup[1]] : 'none' }
            ]
        }
    }

    _parse(jObj: any, codeObj: any) {
        let resmsg = ''
        const resTable: any = {
            table: { tr: [] }
        }
        let resCount = 0
        const _ = (curObj: any, key: string) => {
            if (key === 'head') {
                // if curObj is head, skip
                return
            }

            // handle the messages
            if (curObj['@_class'] === "body") {
                resmsg += curObj.msg
                // {div: Array(2), @_class: 'body'}
                const lastDiv = curObj.div[curObj.div.length - 1]
                if (this._checkRevenueAndProfit(lastDiv)) {
                    // output format
                    resCount++
                    resTable.table.tr.push(
                        this._outputTd(lastDiv, resCount, codeObj)
                    )
                }

                return
            }

            // traverse
            if (typeof curObj === "object") {
                for (const key in curObj) {
                    if (key.startsWith('@')) {
                        continue
                    }
                    _(curObj[key], key);
                }
            }
        }
        _(jObj, 'root')
        return resTable
    }

    _parseForCode(jObj: any) {

        let resmsg = ''
        let trVal: any = null
        let resCount = 0
        const _ = (curObj: any, key: string) => {
            if (key === 'head' || trVal) {
                // if curObj is head, skip
                // or result has been found.
                return
            }
            if (key === 'tr') {
                trVal = curObj
                return
            }
            // traverse
            if (typeof curObj === "object") {
                for (const key in curObj) {
                    if (key.startsWith('@')) {
                        continue
                    }
                    _(curObj[key], key);
                }
            }
        }
        _(jObj, 'root')

        const stockCodes = this._genStockCodeObj(trVal)

        return stockCodes
    }
}
function doSomething(keystOption: any) {
    console.log(keystOption)
}

async function main() {
    const program = new Command();
    program
        .version('1.0.0', '-v, --version')
        .name('awake-tiger')
        .usage('[OPTIONS]...')
        .option('-f, --filepath <file_path>', 'filepath of input file')
        .option('-o, --output-path <file_path>', 'filepath of outut file')
        .option('-cl, --code-list <file_path>', 'generate code list')
        // .option('-kv, --keyvalue <log_file>,<key_file>', 'extract keys from a log')
        .parse(process.argv);

    const options = program.opts();

    if ('codeList' in options) {
        const lkoala = new AwakeTiger2()
        await lkoala.readStockCodeList(options.codeList)
        return
    } else if ('filepath' in options) {
        let outputPath = ''
        if('outputPath' in options) {
            outputPath = options.outputPath
        }
        const atiger = new AwakeTiger2(options.filepath, outputPath)
        await atiger.readAndParseInput()
        return
    }



}


main()
