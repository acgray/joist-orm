import { camelCase } from "change-case";
import { code, Code, imp } from "ts-poet";
import { Config } from "./config";
import { EntityDbMetadata } from "./EntityDbMetadata";
import { EntityMetadata, EnumFieldSerde, ForeignKeySerde, PrimaryKeySerde, SimpleSerde } from "./symbols";

export function generateMetadataFile(config: Config, dbMetadata: EntityDbMetadata): Code {
  const { entity } = dbMetadata;

  const { primaryKey, primitives, enums, m2o } = generateColumns(dbMetadata);
  const { primaryKeyField, primitiveFields, enumFields, m2oFields, o2mFields, m2mFields } = generateFields(
    config,
    dbMetadata,
  );

  return code`
    export const ${entity.metaName}: ${EntityMetadata}<${entity.type}> = {
      cstr: ${entity.type},
      type: "${entity.name}",
      tagName: "${camelCase(entity.name)}",
      tableName: "${dbMetadata.tableName}",
      columns: [ ${primaryKey} ${enums} ${primitives} ${m2o} ],
      fields: [ ${primaryKeyField} ${enumFields} ${primitiveFields} ${m2oFields} ${o2mFields} ${m2mFields} ],
      config: ${entity.configConst},
      factory: ${imp(`new${entity.name}@./entities`)},
    };

    (${entity.name} as any).metadata = ${entity.metaName};
  `;
}

function generateColumns(
  dbMetadata: EntityDbMetadata,
): { primaryKey: Code; primitives: Code[]; enums: Code[]; m2o: Code[] } {
  const primaryKey = code`
    { fieldName: "id", columnName: "id", dbType: "int", serde: new ${PrimaryKeySerde}(() => ${dbMetadata.entity.metaName}, "id", "id") },
  `;

  const primitives = dbMetadata.primitives.map((p) => {
    const { fieldName, columnName, columnType } = p;
    return code`
      {
        fieldName: "${fieldName}",
        columnName: "${columnName}",
        dbType: "${columnType}",
        serde: new ${SimpleSerde}("${fieldName}", "${columnName}"),
      },`;
  });

  const enums = dbMetadata.enums.map((e) => {
    const { fieldName, columnName, enumDetailType } = e;
    return code`
      {
        fieldName: "${fieldName}",
        columnName: "${columnName}",
        dbType: "int",
        serde: new ${EnumFieldSerde}("${fieldName}", "${columnName}", ${enumDetailType}),
      },
    `;
  });

  const m2o = dbMetadata.manyToOnes.map((m2o) => {
    const { fieldName, columnName, otherEntity } = m2o;
    return code`
      {
        fieldName: "${fieldName}",
        columnName: "${columnName}",
        dbType: "int",
        serde: new ${ForeignKeySerde}("${fieldName}", "${columnName}", () => ${otherEntity.metaName}),
      },
    `;
  });

  return { primaryKey, primitives, enums, m2o };
}

function generateFields(
  config: Config,
  dbMetadata: EntityDbMetadata,
): {
  primaryKeyField: Code;
  primitiveFields: Code[];
  enumFields: Code[];
  m2oFields: Code[];
  o2mFields: Code[];
  m2mFields: Code[];
} {
  const primaryKeyField = code`
    { kind: "primaryKey", fieldName: "id", required: true },
  `;

  const primitiveFields = dbMetadata.primitives.map((p) => {
    const { fieldName, derived } = p;
    return code`
      {
        kind: "primitive",
        fieldName: "${fieldName}",
        derived: ${!derived ? false : `"${derived}"`},
        required: ${!derived && p.notNull},
        protected: ${p.protected},
        type: ${typeof p.fieldType === "string" ? `"${p.fieldType}"` : p.fieldType},
      },`;
  });

  const enumFields = dbMetadata.enums.map(({ fieldName, enumDetailType, notNull }) => {
    return code`
      {
        kind: "enum",
        fieldName: "${fieldName}",
        required: ${notNull},
        enumDetailType: ${enumDetailType},
      },
    `;
  });

  const m2oFields = dbMetadata.manyToOnes.map((m2o) => {
    const { fieldName, notNull, otherEntity, otherFieldName } = m2o;
    return code`
      {
        kind: "m2o",
        fieldName: "${fieldName}",
        required: ${notNull},
        otherMetadata: () => ${otherEntity.metaName},
        otherFieldName: "${otherFieldName}",
      },
    `;
  });

  const o2mFields = dbMetadata.oneToManys.map((m2o) => {
    const { fieldName, otherEntity, otherFieldName } = m2o;
    return code`
      {
        kind: "o2m",
        fieldName: "${fieldName}",
        required: false,
        otherMetadata: () => ${otherEntity.metaName},
        otherFieldName: "${otherFieldName}",
      },
    `;
  });

  const m2mFields = dbMetadata.manyToManys.map((m2o) => {
    const { fieldName, otherEntity, otherFieldName } = m2o;
    return code`
      {
        kind: "m2m",
        fieldName: "${fieldName}",
        required: false,
        otherMetadata: () => ${otherEntity.metaName},
        otherFieldName: "${otherFieldName}",
      },
    `;
  });

  return { primaryKeyField, primitiveFields, enumFields, m2oFields, o2mFields, m2mFields };
}
