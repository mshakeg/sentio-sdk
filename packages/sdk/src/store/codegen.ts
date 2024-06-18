import {
  DirectiveNode,
  GraphQLEnumType,
  GraphQLField,
  GraphQLInterfaceType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLScalarType,
  GraphQLSchema,
  Kind,
  isObjectType,
  isInterfaceType,
  isListType
} from 'graphql'
import * as fs from 'node:fs'
import path from 'path'
import mkdirp from 'mkdirp'
import { schemaFromFile } from './schema.js'
import chalk from 'chalk'

export async function codegen(srcDir: string, outputDir: string) {
  for (const file of fs.readdirSync(srcDir)) {
    const f = path.join(srcDir, file)
    const filePath = path.parse(f)
    if (filePath.ext == '.graphql') {
      const { schema, source } = schemaFromFile(f)
      const target = path.join(outputDir, filePath.name + '.ts')
      await codegenInternal(schema, source, target)
      console.log(chalk.green(`Generated ${target}`))
    }
  }
}

async function codegenInternal(schema: GraphQLSchema, source: string, target: string) {
  const results: string[] = [
    '/* Autogenerated file. Do not edit manually. */\n',
    '/* tslint:disable */',
    '/* eslint-disable */',
    "import { entity, derivedFrom, DateTime, Int, Float, String, Bytes, Boolean, ID, Entity, Store } from '@sentio/sdk/store'",
    `import { BigDecimalConverter, BigIntConverter, IntConverter, StringConverter, IDConverter, BooleanConverter, BytesConverter, DateTimeConverter, FloatConverter, StructConverter, required_, array_, enumerate_, objectId_ } from '@sentio/sdk/store'`,
    `import { DatabaseSchema, BigDecimal } from "@sentio/sdk"`,
    `type BigInt = bigint`
  ]
  const entities: string[] = []

  for (const t of Object.values(schema.getTypeMap())) {
    if (t.name.startsWith('__')) {
      continue
    }
    if (t instanceof GraphQLEnumType) {
      results.push(genEnum(t))
    }
    if (t instanceof GraphQLInterfaceType) {
      results.push(genInterface(t))
    }
  }
  for (const t of Object.values(schema.getTypeMap())) {
    if (t.name.startsWith('__')) {
      continue
    }

    if (t instanceof GraphQLObjectType) {
      const entityContent = genEntity(t)
      results.push(entityContent)
      entities.push(t.name)
    }
  }

  const contents =
    results.join('\n') +
    `\n
const source = \`${source.replaceAll('`', '`')}\`
DatabaseSchema.register({
  source,
  entities: {
    ${entities.map((e) => `"${e}": ${e}`).join(',\n\t\t')}
  }
})
`
  await mkdirp(path.dirname(target))

  fs.writeFileSync(target, contents)
}

const JsTypes: Record<string, string> = {
  ID: 'string',
  String: 'string',
  Int: 'number',
  Float: 'number',
  Boolean: 'boolean',
  BigInt: 'bigint',
  BigDecimal: 'BigDecimal',
  DateTime: 'Date',
  Json: 'any',
  Bytes: 'Uint8Array'
}
const graphqlTypes = Object.entries(JsTypes).reduce(
  (acc, [k, v]) => {
    acc[v] = k
    return acc
  },
  {} as Record<string, string>
)

function genType(type: GraphQLOutputType, required?: boolean): string {
  if (type instanceof GraphQLNonNull) {
    return genType(type.ofType, true)
  } else if (type instanceof GraphQLScalarType) {
    return required ? type.name : `${type.name} | undefined`
  } else if (type instanceof GraphQLObjectType || type instanceof GraphQLInterfaceType) {
    return type.name
  } else if (type instanceof GraphQLList) {
    return `Array<${genType(type.ofType)}>`
  } else if (type instanceof GraphQLEnumType) {
    return type.name
  } else {
    throw new Error('Unsupported type: ' + type)
  }
}

function isObject(type: GraphQLOutputType) {
  if (type instanceof GraphQLNonNull) {
    return isObject(type.ofType)
  } else if (type instanceof GraphQLList) {
    return isObject(type.ofType)
  }
  return isObjectType(type) || isInterfaceType(type)
}

function isList(type: GraphQLOutputType) {
  if (type instanceof GraphQLNonNull) {
    return isListType(type.ofType)
  } else {
    return isListType(type)
  }
}

function getElementType(type: GraphQLOutputType) {
  if (type instanceof GraphQLNonNull) {
    return getElementType(type.ofType)
  } else if (type instanceof GraphQLList) {
    return type.ofType
  }
  return type
}

const getConverter = (t: GraphQLOutputType): string => {
  if (t instanceof GraphQLNonNull) {
    return `required_(${getConverter(t.ofType)})`
  }
  if (t instanceof GraphQLList) {
    return `array_(${getConverter(t.ofType)})`
  }
  if (t instanceof GraphQLEnumType) {
    return `enumerate_<${t.name}>(${t.name})`
  }
  if (isObject(t)) {
    return `objectId_<${genType(getElementType(t))}>()`
  }
  return `${t.name}Converter`
}

function genField(field: GraphQLField<any, any>) {
  const isNonNull = field.type instanceof GraphQLNonNull
  const directives = field.astNode?.directives?.map((d) => '\t' + directive2decorator(d) + '\n') || []

  const type = genType(field.type)

  if (isObject(field.type)) {
    const t = getElementType(field.type)
    const typeAsArg = isInterfaceType(t) ? `"${t}"` : genType(t)

    if (isList(field.type)) {
      const required = (field.type as GraphQLList<any>).ofType instanceof GraphQLNonNull
      const converter = required ? `array_(required_(IDConverter))` : `array_(IDConverter)`
      const returnType = required ? `ID[]` : `Array<ID | undefined>`
      return `${directives.join()}\tget ${field.name}(): Promise<${genType(t)}[]> { return this.getFieldObjectArray(${typeAsArg}, "${field.name}") as Promise<${genType(t)}[]> }
  set ${field.name}(value: ${type} | ID[]) { this.setObject("${field.name}", value) }
  get ${field.name}Ids(): ${returnType} { return this.get("${field.name}", ${converter}) }`
    }

    return `${directives.join()}\tget ${field.name}(): Promise<${genType(t)} | undefined> { return this.getObject(${typeAsArg},"${field.name}") as Promise<${genType(t)} | undefined> }
  set ${field.name}(value: ${type} | ID) { this.set("${field.name}", value, objectId_<${type}>()) }
  get ${field.name}Id(): ID | undefined { return this.get("${field.name}", IDConverter) }`
  }

  return `${directives.join()}\tget ${field.name}(): ${type} { return this.get("${field.name}", ${getConverter(field.type)}) }
  set ${field.name}(value: ${type}) { this.set("${field.name}", value, ${getConverter(field.type)}) }`
}

function genDataType(t: GraphQLObjectType<any, any>) {
  let output = `type ${t.name}Data = `
  const relationsFields = Object.values(t.getFields()).filter((f) => isObject(f.type))
  if (relationsFields.length > 0) {
    output += `Omit<${t.name}, ${relationsFields.map((f) => `"${f.name}"`).join(' | ')}>`

    output +=
      ' & {' +
      relationsFields
        .map((f) => {
          const type = genType(getElementType(f.type))
          return `${f.name}?: ${isList(f.type) ? `Array<ID|${type}>` : `ID | ${type}`}`
        })
        .join(', ') +
      '}'
  } else {
    output += `${t.name}`
  }
  return output
}

function genEntity(t: GraphQLObjectType<any, any>) {
  const decorators = t.astNode?.directives?.filter((d) => d.name.value != 'entity').map(directive2decorator) || []

  let impls = ''
  if (t.getInterfaces().length > 0) {
    impls +=
      ' implements ' +
      t
        .getInterfaces()
        .map((i) => i.name)
        .join(', ')
  }

  return `
${genDataType(t)}
${decorators.join('\n')}
@entity("${t.name}")
export class ${t.name} extends Entity${impls} {
  ${genConverters(t)}
  constructor(data: Partial<${t.name}Data>) {
    super(${t.name}.entityConverter.from(data))
  }
${Object.values(t.getFields()).map(genField).join('\n')}
}`
}

function genConverters(t: GraphQLObjectType<any, any>) {
  const fields = Object.values(t.getFields())
  const converters = fields.map((f) => {
    const type = genType(f.type)
    const converter = getConverter(f.type)
    return `\t\t${f.name}: ${converter},`
  })
  return `static entityConverter = new StructConverter({\n ${converters.join('\n')} \n})`
}

function genInterface(t: GraphQLInterfaceType) {
  return `
export interface ${t.name} {
${Object.values(t.getFields())
  .map((f) => `\t${f.name}: ${genType(f.type)}`)
  .join('\n')}
}`
}

export function directive2decorator(directive: DirectiveNode) {
  let s = `@${directive.name.value}`
  if (directive.arguments?.length) {
    s += `(${directive.arguments
      ?.map((arg) => {
        return arg.value.kind === Kind.STRING ? `"${arg.value.value}"` : `${arg.value}`
      })
      .join(', ')})`
  }
  return s
}

function genEnum(t: GraphQLEnumType) {
  return `
export enum ${t.name} {
${t
  .getValues()
  .map((v) => `\t${v.name} = "${v.value}"`)
  .join(', ')}
}`
}
