import {
  BaseEntity,
  cleanStringValue,
  ConfigApi,
  failNoIdYet,
  getField,
  getInstanceData,
  hasLargeManyToMany,
  hasManyToMany,
  isLoaded,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  setField,
  setOpts,
  toIdOf,
  toJSON,
} from "joist-orm";
import type {
  Changes,
  Collection,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  JsonHint,
  JsonPayload,
  LargeCollection,
  Lens,
  Loaded,
  LoadHint,
  OptsOf,
  OrderBy,
  PartialOrNull,
  TaggedId,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import {
  Author,
  authorMeta,
  Book,
  bookMeta,
  EntityManager,
  newTag,
  Publisher,
  publisherMeta,
  Tag,
  tagMeta,
} from "../entities";
import type { BookId, Entity, PublisherId } from "../entities";

export type TagId = Flavor<string, Tag>;

export interface TagFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
}

export interface TagOpts {
  name: string;
  books?: Book[];
  publishers?: Publisher[];
}

export interface TagIdsOpts {
  bookIds?: BookId[] | null;
  publisherIds?: PublisherId[] | null;
}

export interface TagFilter {
  id?: ValueFilter<TagId, never> | null;
  name?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  books?: EntityFilter<Book, BookId, FilterOf<Book>, null | undefined>;
  publishers?: EntityFilter<Publisher, PublisherId, FilterOf<Publisher>, null | undefined>;
}

export interface TagGraphQLFilter {
  id?: ValueGraphQLFilter<TagId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  books?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>, null | undefined>;
  publishers?: EntityGraphQLFilter<Publisher, PublisherId, GraphQLFilterOf<Publisher>, null | undefined>;
}

export interface TagOrder {
  id?: OrderBy;
  name?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
}

export const tagConfig = new ConfigApi<Tag, Context>();

tagConfig.addRule(newRequiredRule("name"));
tagConfig.addRule(newRequiredRule("createdAt"));
tagConfig.addRule(newRequiredRule("updatedAt"));

export abstract class TagCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "t";
  static readonly metadata: EntityMetadata<Tag>;

  declare readonly __orm: {
    filterType: TagFilter;
    gqlFilterType: TagGraphQLFilter;
    orderType: TagOrder;
    optsType: TagOpts;
    fieldsType: TagFields;
    optIdsType: TagIdsOpts;
    factoryOptsType: Parameters<typeof newTag>[1];
  };

  constructor(em: EntityManager, opts: TagOpts) {
    super(em, opts);
    setOpts(this as any as Tag, opts, { calledFromConstructor: true });
  }

  get id(): TagId {
    return this.idMaybe || failNoIdYet("Tag");
  }

  get idMaybe(): TagId | undefined {
    return toIdOf(tagMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("Tag");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get name(): string {
    return getField(this, "name");
  }

  set name(name: string) {
    setField(this, "name", cleanStringValue(name));
  }

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
  }

  set(opts: Partial<TagOpts>): void {
    setOpts(this as any as Tag, opts);
  }

  setPartial(opts: PartialOrNull<TagOpts>): void {
    setOpts(this as any as Tag, opts as OptsOf<Tag>, { partial: true });
  }

  get changes(): Changes<Tag> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<Tag>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Tag, fn, opts);
  }

  populate<const H extends LoadHint<Tag>>(hint: H): Promise<Loaded<Tag, H>>;
  populate<const H extends LoadHint<Tag>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Tag, H>>;
  populate<const H extends LoadHint<Tag>, V>(hint: H, fn: (t: Loaded<Tag, H>) => V): Promise<V>;
  populate<const H extends LoadHint<Tag>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (t: Loaded<Tag, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<Tag>, V>(
    hintOrOpts: any,
    fn?: (t: Loaded<Tag, H>) => V,
  ): Promise<Loaded<Tag, H> | V> {
    return this.em.populate(this as any as Tag, hintOrOpts, fn);
  }

  isLoaded<const H extends LoadHint<Tag>>(hint: H): this is Loaded<Tag, H> {
    return isLoaded(this as any as Tag, hint);
  }

  toJSON(): object;
  toJSON<const H extends JsonHint<Tag>>(hint: H): Promise<JsonPayload<Tag, H>>;
  toJSON(hint?: any): object {
    return hint ? toJSON(this, hint) : super.toJSON();
  }

  get books(): Collection<Tag, Book> {
    const { relations } = getInstanceData(this);
    return relations.books ??= hasManyToMany(
      this as any as Tag,
      "books_to_tags",
      "books",
      "tag_id",
      bookMeta,
      "tags",
      "book_id",
    );
  }

  get publishers(): Collection<Tag, Publisher> {
    const { relations } = getInstanceData(this);
    return relations.publishers ??= hasManyToMany(
      this as any as Tag,
      "publishers_to_tags",
      "publishers",
      "tag_id",
      publisherMeta,
      "tags",
      "publisher_id",
    );
  }

  get authors(): LargeCollection<Tag, Author> {
    const { relations } = getInstanceData(this);
    return relations.authors ??= hasLargeManyToMany(
      this as any as Tag,
      "authors_to_tags",
      "authors",
      "tag_id",
      authorMeta,
      "tags",
      "author_id",
    );
  }
}
