import { Entity, EntityConstructor, isEntity } from "../EntityManager";
import { Reference } from "../index";
import { OneToManyCollection } from "./OneToManyCollection";

/**
 * Manages a foreign key from one entity to another, i.e. `Book.author --> Author`.
 *
 * We keep the current `author` / `author_id` value in the `__orm.data` hash, where the
 * current value could be either the (string) author id from the database, or an entity
 * `Author` that the user has set.
 */
export class ManyToOneReference<T extends Entity, U extends Entity, N extends never | undefined>
  implements Reference<T, U, N> {
  constructor(
    private entity: T,
    public otherType: EntityConstructor<U>,
    private fieldName: keyof T,
    public otherFieldName: keyof U,
    private notNull: boolean,
  ) {}

  async load(): Promise<U | N> {
    // This will be a string id unless we've already loaded it.
    const current = this.current();
    if (isEntity(current)) {
      return this.ensureNotDeleted(current as U);
    }
    if (current === undefined) {
      return undefined as N;
    }
    // Resolve the id to an entity, and then put it back in __orm.data for any future load()/get() calls.
    const other = ((await this.entity.__orm.em.load(this.otherType, current)) as any) as U;
    this.entity.__orm.data[this.fieldName] = other;
    return this.ensureNotDeleted(other);
  }

  set(other: U | N, opts?: { beingDeleted?: boolean }): void {
    this.setImpl(other, opts);
  }

  get get(): U | N {
    // This should only be callable in the type system if we've already resolved this to an instance
    const current = this.current();
    if (current !== undefined && !isEntity(current)) {
      throw new Error(`${current} should have been an object`);
    }
    return this.ensureNotDeleted(current as U | N);
  }

  // Internal method used by OneToManyCollection
  setImpl(other: U | N, opts?: { beingDeleted?: boolean }): void {
    // If had an existing value, remove us from its collection
    const current = this.current();
    if (other === current) {
      return;
    }

    if (isEntity(current)) {
      const previousCollection = (current[this.otherFieldName] as any) as OneToManyCollection<U, T>;
      previousCollection.removeIfLoaded(this.entity);
    }

    if (!opts || opts.beingDeleted !== true) {
      (this.entity as any).ensureNotDeleted();
    }
    this.entity.__orm.data[this.fieldName] = other;
    this.entity.__orm.dirty = true;

    if (other !== undefined) {
      const newCollection = ((other as U)[this.otherFieldName] as any) as OneToManyCollection<U, T>;
      newCollection.add(this.entity);
    }
  }

  current(): U | undefined | string {
    return this.entity.__orm.data[this.fieldName];
  }

  private ensureNotDeleted(e: U | N): U | N {
    if (e !== undefined && e.__orm.deleted) {
      if (this.notNull) {
        throw new Error(`Referenced entity ${e} has been marked as deleted`);
      }
      return undefined as N;
    }
    return e;
  }
}