defmodule ParchmentStudios.Assets.StampAsset do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "stamp_assets" do
    field :name, :string
    field :category, :string
    field :layers, {:array, :map}, default: []
    field :thumbnail_url, :string

    belongs_to :asset_pack, ParchmentStudios.Assets.AssetPack, foreign_key: :pack_id

    timestamps(type: :utc_datetime)
  end

  def changeset(stamp_asset, attrs) do
    stamp_asset
    |> cast(attrs, [:name, :pack_id, :category, :layers, :thumbnail_url])
    |> validate_required([:name, :pack_id])
    |> foreign_key_constraint(:pack_id)
  end
end
