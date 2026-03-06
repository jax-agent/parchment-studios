defmodule ParchmentStudios.Repo do
  use Ecto.Repo,
    otp_app: :parchment_studios,
    adapter: Ecto.Adapters.SQLite3
end
