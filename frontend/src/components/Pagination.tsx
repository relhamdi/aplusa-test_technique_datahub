import { pageCount } from "../utils/tableState";

interface PaginationProps<S extends number> {
  page: number;
  pageSize: S;
  sizes: readonly S[]; // the sizes the server accepts for this table
  total: number;
  disabled: boolean;
  onPage: (page: number) => void;
  onPageSize: (size: S) => void;
}

const fr = (n: number) => n.toLocaleString("fr-FR");

export function Pagination<S extends number>({
  page,
  pageSize,
  sizes,
  total,
  disabled,
  onPage,
  onPageSize,
}: PaginationProps<S>) {
  const pages = pageCount(total, pageSize);
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav className="pagination" aria-label="Pagination">
      <span>{`${fr(first)}–${fr(last)} sur ${fr(total)}`}</span>

      <button
        type="button"
        aria-label="Première page"
        disabled={disabled || page <= 1}
        onClick={() => onPage(1)}
      >
        «
      </button>
      <button
        type="button"
        aria-label="Page précédente"
        disabled={disabled || page <= 1}
        onClick={() => onPage(page - 1)}
      >
        ‹
      </button>
      <span>{`Page ${fr(page)} sur ${fr(pages)}`}</span>
      <button
        type="button"
        aria-label="Page suivante"
        disabled={disabled || page >= pages}
        onClick={() => onPage(page + 1)}
      >
        ›
      </button>
      <button
        type="button"
        aria-label="Dernière page"
        disabled={disabled || page >= pages}
        onClick={() => onPage(pages)}
      >
        »
      </button>

      <label>
        Lignes par page{" "}
        <select
          aria-label="Lignes par page"
          value={pageSize}
          disabled={disabled}
          onChange={(event) => onPageSize(Number(event.target.value) as S)}
        >
          {sizes.map((size) => (
            <option key={size} value={size}>
              {fr(size)}
            </option>
          ))}{" "}
        </select>
      </label>
    </nav>
  );
}
