defmodule ParchmentStudios.Assets.AssetPack do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}

  schema "asset_packs" do
    field :name, :string
    field :description, :string
    field :style, :string

    has_many :stamp_assets, ParchmentStudios.Assets.StampAsset, foreign_key: :pack_id

    timestamps(type: :utc_datetime)
  end

  def changeset(asset_pack, attrs) do
    asset_pack
    |> cast(attrs, [:name, :description, :style])
    |> validate_required([:name])
    |> unique_constraint(:name)
  end
end
