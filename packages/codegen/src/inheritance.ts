import {
  DbMetadata,
  EntityDbMetadata,
  ManyToOneField,
  PolymorphicFieldComponent,
  makeEntity,
} from "./EntityDbMetadata";
import { Config } from "./config";
import { fail } from "./utils";

export function applyInheritanceUpdates(config: Config, db: DbMetadata): void {
  const { entities, entitiesByName } = db;
  setClassTableInheritance(entities, entitiesByName);
  expandSingleTableInheritance(config, entities);
  rewriteSingleTableForeignKeys(config, entities);
}

/**
 * Ensure CTI base types have their inheritanceType set.
 *
 * (We automatically set `inheritanceType` for STI tables when we see their config
 * setup, see `expandSingleTableInheritance`.)
 */
function setClassTableInheritance(
  entities: EntityDbMetadata[],
  entitiesByName: Record<string, EntityDbMetadata>,
): void {
  const ctiBaseNames: string[] = [];
  for (const entity of entities) {
    if (entity.baseClassName) {
      ctiBaseNames.push(entity.baseClassName);
      entitiesByName[entity.baseClassName].subTypes.push(entity);
    }
  }
  for (const entity of entities) {
    if (ctiBaseNames.includes(entity.name)) entity.inheritanceType = "cti";
  }
}

/** Expands STI tables into multiple entities, so they get separate `SubTypeCodegen.ts` & `SubType.ts` files. */
function expandSingleTableInheritance(config: Config, entities: EntityDbMetadata[]): void {
  for (const entity of entities) {
    const [fieldName, stiField] =
      Object.entries(config.entities[entity.name]?.fields || {}).find(([, f]) => !!f.stiDiscriminator) ?? [];
    if (fieldName && stiField && stiField.stiDiscriminator) {
      entity.inheritanceType = "sti";
      // Ensure we have an enum field so that we can bake the STI discriminators into the metadata.ts file
      const enumField =
        entity.enums.find((e) => e.fieldName === fieldName) ??
        fail(`No enum column found for ${entity.name}.${fieldName}, which is required to use singleTableInheritance`);
      entity.stiDiscriminatorField = enumField.fieldName;
      for (const [enumCode, subTypeName] of Object.entries(stiField.stiDiscriminator)) {
        // Find all the base entity's fields that belong to us
        const subTypeFields = [
          ...Object.entries(config.entities[entity.name]?.fields ?? {}),
          ...Object.entries(config.entities[entity.name]?.relations ?? {}),
        ].filter(([, f]) => f.stiType === subTypeName);
        const subTypeFieldNames = subTypeFields.map(([name]) => name);

        // Make fields as required
        function maybeRequired<T extends { notNull: boolean; fieldName: string }>(field: T): T {
          const config = subTypeFields.find(([name]) => name === field.fieldName)?.[1]!;
          if (config.stiNotNull) field.notNull = true;
          return field;
        }

        // Synthesize an entity for this STI sub-entity
        const subEntity: EntityDbMetadata = {
          name: subTypeName,
          entity: makeEntity(subTypeName),
          tableName: entity.tableName,
          primaryKey: entity.primaryKey,
          primitives: entity.primitives.filter((f) => subTypeFieldNames.includes(f.fieldName)).map(maybeRequired),
          enums: entity.enums.filter((f) => subTypeFieldNames.includes(f.fieldName)).map(maybeRequired),
          pgEnums: entity.pgEnums.filter((f) => subTypeFieldNames.includes(f.fieldName)).map(maybeRequired),
          manyToOnes: entity.manyToOnes.filter((f) => subTypeFieldNames.includes(f.fieldName)).map(maybeRequired),
          oneToManys: entity.oneToManys.filter((f) => subTypeFieldNames.includes(f.fieldName)),
          largeOneToManys: entity.largeOneToManys.filter((f) => subTypeFieldNames.includes(f.fieldName)),
          oneToOnes: entity.oneToOnes.filter((f) => subTypeFieldNames.includes(f.fieldName)),
          manyToManys: entity.manyToManys.filter((f) => subTypeFieldNames.includes(f.fieldName)),
          largeManyToManys: entity.largeManyToManys.filter((f) => subTypeFieldNames.includes(f.fieldName)),
          polymorphics: entity.polymorphics.filter((f) => subTypeFieldNames.includes(f.fieldName)),
          tagName: entity.tagName,
          createdAt: undefined,
          updatedAt: undefined,
          deletedAt: undefined,
          baseClassName: entity.name,
          subTypes: [],
          inheritanceType: "sti",
          stiDiscriminatorValue: (
            enumField.enumRows.find((r) => r.code === enumCode) ??
            fail(`No enum row found for ${entity.name}.${fieldName}.${enumCode}`)
          ).id,
          abstract: false,
          nonDeferredFkOrder: entity.nonDeferredFkOrder,
          get nonDeferredFks(): Array<ManyToOneField | PolymorphicFieldComponent> {
            return [
              ...this.manyToOnes.filter((r) => !r.isDeferredAndDeferrable),
              ...this.polymorphics.flatMap((p) => p.components).filter((c) => !c.isDeferredAndDeferrable),
            ];
          },
        };

        // Now strip all the subclass fields from the base class
        entity.primitives = entity.primitives.filter((f) => !subTypeFieldNames.includes(f.fieldName));
        entity.enums = entity.enums.filter((f) => !subTypeFieldNames.includes(f.fieldName));
        entity.pgEnums = entity.pgEnums.filter((f) => !subTypeFieldNames.includes(f.fieldName));
        entity.manyToOnes = entity.manyToOnes.filter((f) => !subTypeFieldNames.includes(f.fieldName));
        entity.oneToManys = entity.oneToManys.filter((f) => !subTypeFieldNames.includes(f.fieldName));
        entity.largeOneToManys = entity.largeOneToManys.filter((f) => !subTypeFieldNames.includes(f.fieldName));
        entity.oneToOnes = entity.oneToOnes.filter((f) => !subTypeFieldNames.includes(f.fieldName));
        entity.manyToManys = entity.manyToManys.filter((f) => !subTypeFieldNames.includes(f.fieldName));
        entity.largeManyToManys = entity.largeManyToManys.filter((f) => !subTypeFieldNames.includes(f.fieldName));
        entity.polymorphics = entity.polymorphics.filter((f) => !subTypeFieldNames.includes(f.fieldName));

        entities.push(subEntity);
      }
    }
  }
}

type StiEntityMap = Map<string, { base: EntityDbMetadata; subTypes: EntityDbMetadata[] }>;
let stiEntities: StiEntityMap;

export function getStiEntities(entities: EntityDbMetadata[]): StiEntityMap {
  if (stiEntities) return stiEntities;
  stiEntities = new Map();
  for (const entity of entities) {
    if (entity.inheritanceType === "sti" && entity.stiDiscriminatorField) {
      const base = entity;
      const subTypes = entities.filter((s) => s.baseClassName === entity.name && s !== entity);
      stiEntities.set(entity.name, { base, subTypes });
      // Allow looking up by subType name
      for (const subType of subTypes) {
        stiEntities.set(subType.name, { base, subTypes: [] });
      }
    }
  }
  return stiEntities;
}

/** Finds FKs pointing to the base table and, if configured, rewrites them to point to the sub-tables. */
function rewriteSingleTableForeignKeys(config: Config, entities: EntityDbMetadata[]): void {
  // See if we even have any STI tables
  const stiEntities = getStiEntities(entities);
  if (stiEntities.size === 0) return;
  // Scan for other entities/relations that point to the STI table
  for (const entity of entities) {
    // m2os -- Look for `entity.task_id` FKs pointing at `Task` and, if configured, rewrite them to point at `TaskOld`
    for (const m2o of entity.manyToOnes) {
      const target = stiEntities.get(m2o.otherEntity.name);
      const base = target?.base.entity.name;
      // See if the user has pushed `Task.entities` down to a subtype
      const stiType = base && config.entities[base]?.relations?.[m2o.otherFieldName]?.stiType;
      if (target && stiType) {
        const { subTypes } = target;
        m2o.otherEntity = (
          subTypes.find((s) => s.name === stiType) ??
          fail(`Could not find STI type '${stiType}' in ${subTypes.map((s) => s.name)}`)
        ).entity;
      }
    }
    // polys -- Look for `entity.parent_task_id` FKs pointing at `Task` and, if configured, rewrite them to point at `TaskOld`
    for (const poly of entity.polymorphics) {
      for (const comp of poly.components) {
        const target = stiEntities.get(comp.otherEntity.name);
        const base = target?.base.entity.name;
        // See if the user has pushed `Task.entities` down to a subtype
        const stiType = base && config.entities[base]?.relations?.[comp.otherFieldName]?.stiType;
        if (target && stiType) {
          const { subTypes } = target;
          comp.otherEntity = (
            subTypes.find((s) => s.name === stiType) ??
            fail(`Could not find STI type '${stiType}' in ${subTypes.map((s) => s.name)}`)
          ).entity;
        }
      }
    }
    // o2ms -- Look for `entity.tasks` collections loading `task.entity_id`, but entity has been pushed down to `TaskOld`
    for (const o2m of entity.oneToManys) {
      const target = stiEntities.get(o2m.otherEntity.name);
      if (target && target.base.inheritanceType === "sti") {
        // Ensure the incoming FK is not in the base type, and find the 1st subtype (eventually N subtypes?)
        const otherField = target.subTypes.find(
          (st) =>
            !target.base.manyToOnes.some((m) => m.fieldName === o2m.otherFieldName) &&
            st.manyToOnes.some((m) => m.fieldName === o2m.otherFieldName),
        );
        if (otherField) {
          o2m.otherEntity = otherField.entity;
        }
      }
    }
    // m2ms -- Look for `entity.tasks` collections loading m2m rows, but `entity` has been pushed down to `TaskOld`
    for (const m2m of entity.manyToManys) {
      const target = stiEntities.get(m2m.otherEntity.name);
      if (target && target.base.inheritanceType === "sti") {
        // Ensure the incoming FK is not in the base type, and find the 1st subtype (eventually N subtypes?)
        const otherField = target.subTypes.find(
          (st) =>
            !target.base.manyToManys.some((m) => m.fieldName === m2m.otherFieldName) &&
            st.manyToManys.some((m) => m.fieldName === m2m.otherFieldName),
        );
        if (otherField) {
          m2m.otherEntity = otherField.entity;
        }
      }
    }
  }
}
