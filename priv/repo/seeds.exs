# Script for populating the database. You can run it as:
#
#     mix run priv/repo/seeds.exs
#
# Inside the script, you can read and write to any of your
# repositories directly:
#
#     ParchmentStudios.Repo.insert!(%ParchmentStudios.SomeSchema{})
#
# We recommend using the bang functions (`insert!`, `update!`
# and so on) as they will fail if something goes wrong.

alias ParchmentStudios.Repo
alias ParchmentStudios.Assets.{AssetPack, StampAsset}

# --- Asset Packs ---

Repo.insert!(
  %AssetPack{
    name: "Classic Fantasy",
    description: "Hand-drawn ink on aged parchment",
    style: "classic_fantasy"
  },
  on_conflict: :nothing,
  conflict_target: :name
)

pack = Repo.get_by!(AssetPack, name: "Classic Fantasy")

stamp_layers = fn ->
  [
    %{
      id: "base",
      type: "BASE",
      blend_mode: "normal",
      opacity: 1.0,
      visible: true,
      frames: [],
      fps: 0
    },
    %{
      id: "shadow",
      type: "SHADOW",
      blend_mode: "multiply",
      opacity: 1.0,
      visible: true,
      frames: [],
      fps: 0,
      keyed_to: "lightAngle"
    }
  ]
end

stamps = [
  %{name: "Stone City", category: "settlements"},
  %{name: "Village", category: "settlements"},
  %{name: "Mountain Range", category: "terrain"},
  %{name: "Forest Cluster", category: "terrain"},
  %{name: "Ancient Ruins", category: "landmarks"},
  %{name: "Stone Tower", category: "landmarks"}
]

for stamp <- stamps do
  Repo.insert!(
    %StampAsset{
      name: stamp.name,
      pack_id: pack.id,
      category: stamp.category,
      layers: stamp_layers.()
    },
    on_conflict: :nothing,
    conflict_target: [:name, :pack_id]
  )
end
