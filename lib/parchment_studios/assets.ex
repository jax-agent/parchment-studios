defmodule ParchmentStudios.Assets do
  import Ecto.Query
  alias ParchmentStudios.Repo
  alias ParchmentStudios.Assets.{AssetPack, StampAsset}

  def list_packs do
    Repo.all(AssetPack)
  end

  def get_pack!(id) do
    Repo.get!(AssetPack, id)
  end

  def list_assets(pack_id) do
    StampAsset
    |> where(pack_id: ^pack_id)
    |> Repo.all()
  end

  def list_assets_by_category(pack_id, category) do
    StampAsset
    |> where(pack_id: ^pack_id, category: ^category)
    |> Repo.all()
  end

  def create_pack(attrs \\ %{}) do
    %AssetPack{}
    |> AssetPack.changeset(attrs)
    |> Repo.insert()
  end

  def create_asset(attrs \\ %{}) do
    %StampAsset{}
    |> StampAsset.changeset(attrs)
    |> Repo.insert()
  end
end
