import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../messages/en.json";
import { LoadMore, type LoadMoreQuery } from "./load-more";

function renderLoadMore(query: Partial<LoadMoreQuery>) {
  const full: LoadMoreQuery = {
    hasNextPage: true,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    ...query,
  };
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <LoadMore query={full} />
    </NextIntlClientProvider>,
  );
  return full;
}

describe("LoadMore", () => {
  it("loads the next page", () => {
    const query = renderLoadMore({});
    fireEvent.click(screen.getByRole("button", { name: en.common.loadMore }));
    expect(query.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("is busy while the next page loads", () => {
    renderLoadMore({ isFetchingNextPage: true });
    expect(
      screen.getByRole("button", { name: en.common.loadMore }),
    ).toBeDisabled();
  });

  it("shows a failed next page in place, with a retry", () => {
    const query = renderLoadMore({ isFetchNextPageError: true });
    expect(screen.getByRole("alert")).toHaveTextContent(
      en.common.loadMoreError,
    );
    fireEvent.click(screen.getByRole("button", { name: en.common.retry }));
    expect(query.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("renders nothing on the last page", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <LoadMore
          query={{
            hasNextPage: false,
            isFetchingNextPage: false,
            fetchNextPage: vi.fn(),
          }}
        />
      </NextIntlClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
