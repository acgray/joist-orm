import {
  BaseEntity,
  Changes,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityOrmField,
  fail,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  hasOne,
  isLoaded,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  ManyToOneReference,
  newChangesProxy,
  newRequiredRule,
  OptsOf,
  OrderBy,
  PartialOrNull,
  setField,
  setOpts,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import { EntityManager } from "src/entities";
import { Author, AuthorId, authorMeta, AuthorOrder, Book, bookMeta, newBook } from "./entities";

export type BookId = Flavor<string, "Book">;

export interface BookOpts {
  title: string;
  authorId: Author;
}

export interface BookIdsOpts {
  authorIdId?: AuthorId | null;
}

export interface BookFilter {
  id?: ValueFilter<BookId, never>;
  title?: ValueFilter<string, never>;
  authorId?: EntityFilter<Author, AuthorId, FilterOf<Author>, never>;
}

export interface BookGraphQLFilter {
  id?: ValueGraphQLFilter<BookId>;
  title?: ValueGraphQLFilter<string>;
  authorId?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>>;
}

export interface BookOrder {
  id?: OrderBy;
  title?: OrderBy;
  authorId?: AuthorOrder;
}

export const bookConfig = new ConfigApi<Book, Context>();

bookConfig.addRule(newRequiredRule("title"));
bookConfig.addRule(newRequiredRule("authorId"));

export abstract class BookCodegen extends BaseEntity<EntityManager> {
  static defaultValues: object = {};

  readonly __orm!: EntityOrmField & {
    filterType: BookFilter;
    gqlFilterType: BookGraphQLFilter;
    orderType: BookOrder;
    optsType: BookOpts;
    optIdsType: BookIdsOpts;
    factoryOptsType: Parameters<typeof newBook>[1];
  };

  readonly authorId: ManyToOneReference<Book, Author, never> = hasOne(authorMeta, "authorId", "books");

  constructor(em: EntityManager, opts: BookOpts) {
    super(em, bookMeta, BookCodegen.defaultValues, opts);
    setOpts(this as any as Book, opts, { calledFromConstructor: true });
  }

  get id(): BookId | undefined {
    return this.__orm.data["id"];
  }

  get idOrFail(): BookId {
    return this.id || fail("Book has no id yet");
  }

  get title(): string {
    return this.__orm.data["title"];
  }

  set title(title: string) {
    setField(this, "title", title);
  }

  set(opts: Partial<BookOpts>): void {
    setOpts(this as any as Book, opts);
  }

  setPartial(opts: PartialOrNull<BookOpts>): void {
    setOpts(this as any as Book, opts as OptsOf<Book>, { partial: true });
  }

  get changes(): Changes<Book> {
    return newChangesProxy(this as any as Book);
  }

  load<U, V>(fn: (lens: Lens<Book>) => Lens<U, V>): Promise<V> {
    return loadLens(this as any as Book, fn);
  }

  populate<H extends LoadHint<Book>>(hint: H): Promise<Loaded<Book, H>>;
  populate<H extends LoadHint<Book>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Book, H>>;
  populate<H extends LoadHint<Book>, V>(hint: H, fn: (b: Loaded<Book, H>) => V): Promise<V>;
  populate<H extends LoadHint<Book>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (b: Loaded<Book, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<Book>, V>(hintOrOpts: any, fn?: (b: Loaded<Book, H>) => V): Promise<Loaded<Book, H> | V> {
    return this.em.populate(this as any as Book, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<Book>>(hint: H): this is Loaded<Book, H> {
    return isLoaded(this as any as Book, hint);
  }
}