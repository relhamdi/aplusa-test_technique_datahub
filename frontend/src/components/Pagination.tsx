import { PAGE_SIZES, type PageSize } from "../types/api";
import { pageCount } from "../utils/tableState";

interface PaginationProps {
  page: number;
  pageSize: PageSize;
  total: number;
  disabled: boolean;
  onPage: (page: number) => void;
  onPageSize: (size: PageSize) => void;
}

const fr = (n: number) => n.toLocaleString("fr-FR");

export function Pagination({
  page,
  pageSize,
  total,
  disabled,
  onPage,
  onPageSize,
}: PaginationProps) {
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
          onChange={(event) =>
            onPageSize(Number(event.target.value) as PageSize)
          }
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {fr(size)}
            </option>
          ))}{" "}
        </select>
      </label>
    </nav>
  );
}
