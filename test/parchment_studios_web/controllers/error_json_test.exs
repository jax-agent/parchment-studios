defmodule ParchmentStudiosWeb.ErrorJSONTest do
  use ParchmentStudiosWeb.ConnCase, async: true

  test "renders 404" do
    assert ParchmentStudiosWeb.ErrorJSON.render("404.json", %{}) == %{errors: %{detail: "Not Found"}}
  end

  test "renders 500" do
    assert ParchmentStudiosWeb.ErrorJSON.render("500.json", %{}) ==
             %{errors: %{detail: "Internal Server Error"}}
  end
end
