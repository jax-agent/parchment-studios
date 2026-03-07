defmodule ParchmentStudiosWeb.WasmServingTest do
  use ParchmentStudiosWeb.ConnCase, async: true

  test "serves canvaskit.wasm from /wasm/ path", %{conn: conn} do
    conn = get(conn, "/wasm/canvaskit.wasm")

    assert conn.status == 200

    content_type = Plug.Conn.get_resp_header(conn, "content-type") |> List.first("")
    assert content_type =~ "wasm" or content_type =~ "octet-stream"
  end
end
