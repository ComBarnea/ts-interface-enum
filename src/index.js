'use strict';
const jf = require('jsonfile');
const fse = require('fs-extra');
const klaw = require('klaw');
const path = require('path');
const through2 = require('through2');

const _  = require('lodash');
const asyncLib  = require('async');

const moduleConfig = {
    CONFIG_NAME: 'interface-enum',
    MARK_NAME: 'generateInterfaceToEnum',
    ENUM_FILE_SUFFIX: '.interfaceEnums.ts',
    FILE_EXTENSION: '.ts',
    MARK_INTERFACES: '.*generateInterfaceToEnum[\\s\\S]*?^^export interface (\\w+)'
};


const TokenType = {
    END: '}',
    START: '{',
    ASSIGN: ':',
    NON_MANDATORY: '?',
    END_OF_LINE: ';'
};


/**
 * Define interface object
 * @typedef {Object} InterfaceObject
 * @property {String} name
 * @property {Object} interfaceObject
 */

/**
 * Define file interface object
 * @typedef {Object} FileInterfaceObject
 * @property {String} path
 * @property {InterfaceObject[]} interfacesObjects
 */
// generateInterfaceToEnum

// we should only iterate over typescript files
const excludeNotTs = through2.obj(function excludeNotTsFunction(item, enc, next) {
    if(path.extname(item.path) === moduleConfig.FILE_EXTENSION) this.push(item);

    next();
});


const markFileRegEx = new RegExp(moduleConfig.MARK_NAME, 'g');
const markInterfacesRegEx = new RegExp(moduleConfig.MARK_INTERFACES, 'gm');

const filesFound = [];
const filesToProcess = [];
const filesToCreate = [];
let configDataObject;

module.exports = function tsInterfaceEnum(configOptionsData, cb) {
  const jobs = [loadConfig, iterateConfigPaths, checkFiles, removeOldEnumFiles, processFiles, createFiles];

  if (!cb) {
      cb = configOptionsData;
      configOptionsData = null;
  }

  if (configOptionsData) configDataObject = configOptionsData;

  asyncLib.waterfall(jobs, (err) => {
    if(err) {
      return cb(err);
    }

    cb();
    console.log('All enum file generated.');
  });

};


function loadConfig(next) {
    if(configDataObject) {
      return next();
    }

    jf.readFile(`./${moduleConfig.CONFIG_NAME}.json`, (err, data) => {
        if(err) return next('Error loading config file.');

        configDataObject = data;
        next();
    });
}

function iterateConfigPaths(next) {
    if(_.isArray(configDataObject.paths)) {
        asyncLib.eachSeries(configDataObject.paths, iteratePath, (err) => {
            next(err);
        });
    }
}

/**
 * walk over given path
 * only select .ts files
 * @param {String} singlePathString
 * @param {Function} nextPath
 */
function iteratePath(singlePathString, nextPath) {
    klaw(singlePathString)
        .pipe(excludeNotTs)
        .on('data', (item) => {
            filesFound.push(item.path);
        })
        .on('error', (err, item) => {
            console.log('Error loading file: ', item.path); // the file the error occurred on
        })
        .on('end', () => {
            nextPath();
        });
}

function checkFiles(next) {
    asyncLib.eachSeries(filesFound, markFile, (err) => {
        next(err);
    });
}
/**
 * check file for presence of lib interface prefix
 * @param {String} singlePathString
 * @param {Function} nextPath
 */
function markFile(singlePathString, nextPath) {
    fse.readFile(singlePathString, (err, fileBuffer) => {
        if(err) return nextPath(err);

        if(markFileRegEx.test(fileBuffer.toString())) {
            filesToProcess.push(singlePathString);
        }

        nextPath();
    });
}

function removeOldEnumFiles(next) {
    asyncLib.eachSeries(filesToProcess, removeOldEnumFile, (err) => {
        next(err);
    });
}

/**
 * remove all file we are creating this run
 * @param {String} singlePathString
 * @param {Function} nextFile
 */
function removeOldEnumFile(singlePathString, nextFile) {
    const enumFileData = getEnumFileData(singlePathString);

    fse.remove(enumFileData.enumFileFull, (err) => {
        nextFile(err);
    });
}

function processFiles(next) {
    asyncLib.eachSeries(filesToProcess, processFile, (err) => {
        next(err);
    });
}


/**
 * generate interface object array per file
 * @param {String} singlePathString
 * @param {Function} nextPath
 */
function processFile(singlePathString, nextPath) {
    const interfacesObjects = [];

    const processJobs = [_findInterfaces, _generateObjects];

    asyncLib.waterfall(processJobs, (err) => {
        const ans = {path: singlePathString, interfacesObjects};

        filesToCreate.push(ans);

        nextPath(err, ans);
    });

    /**
     * generate interface
     * @param nextTask
     */
    function _findInterfaces(nextTask) {
        findInterfaces(singlePathString, (err, interfaces) => {
            if(err) return nextTask(err);

            nextTask(null, interfaces);
        });
    }

    function _generateObjects(interfaces, nextTask) {
        asyncLib.eachSeries(interfaces, _generateObject, (err) => {
            nextTask(err);
        });
    }

    function _generateObject(singleInterface, nextInterface) {
        generateObject(singlePathString, singleInterface, (err, interfaceObject) => {
            if(err) return nextInterface(err);

            if(interfaceObject) interfacesObjects.push(interfaceObject);

            nextInterface();
        });
    }
}
/**
 * return array of interfaces found
 * @param {String} singlePathString
 * @param {Function} cb - err or string[]
 */
function findInterfaces(singlePathString, cb) {
    const interfaces = [];
    fse.readFile(singlePathString, (err, fileBuffer) => {
        if(err) return cb(err);

        const fileString = fileBuffer.toString();
        let foundMatch = markInterfacesRegEx.exec(fileString);

        while(foundMatch) {
            if(foundMatch.length && foundMatch.length >= 2) {
                interfaces.push(foundMatch[1]);
            }

            foundMatch = markInterfacesRegEx.exec(fileString);
        }

        cb(null, interfaces);
    });
}
/**
 * Find the interface start in file
 * And send it to farther processing
 * @param {String} singlePathString
 * @param {String} singleInterface
 * @param {Function}nextInterface
 */
function generateObject(singlePathString, singleInterface, nextInterface) {
    fse.readFile(singlePathString, (err, fileBuffer) => {
        if(err) return nextInterface(err);

        const fileString = fileBuffer.toString();

        const lines = fileString.split('\n');

        const interfaceReg = new RegExp(`^export interface ${singleInterface.trim()}`);
        let interfaceLine = null;
        let interfaceFound = false;

        lines.forEach((singleLine, index) => {
            if(singleLine.match(interfaceReg)) {
                interfaceFound = true;
                interfaceLine = index;
            }
        });

        if(interfaceFound) {
            const slicedArray = _.takeRight(lines, lines.length - interfaceLine);
            const tmpString = slicedArray.join('\n');

            const interfaceObject = parseInterfaceToObject(tmpString);


            if(_.isEmpty(interfaceObject)) {
                nextInterface();
            } else {
                nextInterface(null, {name: singleInterface, interfaceObject});
            }
        } else {
            nextInterface();
        }
    });
}

/**
 * generate js object from found interface
 * only take first level
 * only take first object
 * @param {String} interfaceCandidate
 * @return {Object} found interface object
 */
function parseInterfaceToObject(interfaceCandidate) {
    const objectsFound = []; // start, end, include
    // iterateLines
    const stringLines = interfaceCandidate.split('\n');

    for(let i = 0; i < stringLines.length; i++) {
        for(let j = 0; j < stringLines[i].length; j++) {
            if(stringLines[i][j] === TokenType.START) {
                objectsFound.push({start: {col: j, line: i}});
            }

            if(stringLines[i][j] === TokenType.END) {
                if(objectsFound.length) {
                    for(let k = 1; k <= objectsFound.length; k++) {
                        const foundObject = objectsFound[objectsFound.length - k];

                        if(foundObject && !foundObject.end) {
                            foundObject.end = {col: j, line: i};
                            break;
                        }
                    }
                }
            }
        }

        // top level interface is inside
        if(objectsFound.length) {
            if(objectsFound[0].hasOwnProperty('start') && objectsFound[0].hasOwnProperty('end')) {
                break;
            }
        }
    }

    const objectInterface = {};

    if(objectsFound.length) {
        if(objectsFound[0].hasOwnProperty('start') && objectsFound[0].hasOwnProperty('end')) {
            // as for now only top level are in our interest
            for(let i = objectsFound[0].start.line + 1; i <= objectsFound[0].end.line - 1; i++) {
                const found  = _.findLastIndex(objectsFound, (singleElement) => (i > singleElement.start.line) && (i < singleElement.end.line));

                if(found === 0 || !found) {
                    const trimLine = stringLines[i].trim();
                    const keyName = trimLine.match(/^(\w+)/g);

                    if(keyName) {
                        objectInterface[keyName[0]] = keyName[0];
                    }
                }
            }
        }
    }

    return objectInterface;
}

function createFiles(next) {
    asyncLib.eachSeries(filesToCreate, createFile, (err) => {
        next(err);
    });
}
/**
 * Create enums and file
 * @param {FileInterfaceObject} fileToCreateObject
 * @param nextFile
 */
function createFile(fileToCreateObject, nextFile) {
    const enumList = fileToCreateObject.interfacesObjects.map((singleInterfaceObject) => {
        const stringToReturn = convertObjectToEnumString(singleInterfaceObject.name, singleInterfaceObject.interfaceObject);

        return `${stringToReturn}`;
    });

    const enumsString = enumList.join('\n\n');

    const enumFileData = getEnumFileData(fileToCreateObject.path);

    const fileString = `// This file was generated by TsInterfaceEnum\n// ${enumFileData.enumFileName}\n
${enumsString}
`;
    fse.outputFile(enumFileData.enumFileFull, fileString, (err) => {
        nextFile(err);
    });
}
/**
 *
 * @param {String} name
 * @param {Object}  objectToCreate
 * @return {string}
 */
function convertObjectToEnumString(name, objectToCreate) {
    const keysStringKeys =  Object.keys(objectToCreate);
    const keysStringArray = keysStringKeys.map((key, index) => {
        if((index + 1) === keysStringKeys.length) {
            return `\t${key} = '${objectToCreate[key]}' as any`;
        }
        return `\t${key} = '${objectToCreate[key]}' as any,`;
    });

    const allKeyString = keysStringArray.join('\n');

    return `
// this enum was auto generated
export enum ${name}Enum {
${allKeyString}
}`;
}

/**
 * generate enum files name
 * @param {String} filePath
 * @return {{enumFileFull: string, enumFileName: string}}
 */
function getEnumFileData(filePath) {
    const fileName = path.basename(filePath, moduleConfig.FILE_EXTENSION);
    const dirName = path.dirname(filePath);
    const enumFileName = fileName + moduleConfig.ENUM_FILE_SUFFIX;

    return {
        enumFileFull: `${dirName}/${enumFileName}`,
        enumFileName
    };
}

