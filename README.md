# TsInterfaceEnum

[![NPM version][npm-image]][npm-url]
[![Downloads][download-badge]][npm-url]

> Converts typescript interfaces to enums
## Pre-requisites
Use of typescript in your code
## Install

```sh
npm i ts-interface-enum --save--dev
```

## Config
### Config file
In your root directory create a file called interface-enum.config.json
The json should look as follows
```
{
  "paths": [
    "./app/model/schemes"
  ]
}
```

### Mark interfaces
For each interface to convert add comment one line above
For now only interface with export are supported due to new file created.
```ts
// my file /app/model/schemes/main.schemes.ts

// generateInterfaceToEnum
export interface IMySchemaInterface {
    id: number;
    moreData: string;
}



```
## Usage
Call the module from where your code, works well inside gulp or npm as pre build script.
Afterwards a new file will be created in the same directory of the found interface with the name of
[foundTsFile].interfaceEnums.ts
On re-run if the file was found to generate again it will be deleted. 
## License

MIT © Tomer Barnea

[npm-url]: https://npmjs.org/package/ts-interface-enum
[npm-image]: https://img.shields.io/npm/v/ts-interface-enum.svg?style=flat-square

[travis-url]: https://travis-ci.org/scopsy/ts-interface-enum
[travis-image]: https://img.shields.io/travis/scopsy/ts-interface-enum.svg?style=flat-square

[download-badge]: http://img.shields.io/npm/dm/ts-interface-enum.svg?style=flat-square
