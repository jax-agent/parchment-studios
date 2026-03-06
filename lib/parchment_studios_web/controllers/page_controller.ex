defmodule ParchmentStudiosWeb.PageController do
  use ParchmentStudiosWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
