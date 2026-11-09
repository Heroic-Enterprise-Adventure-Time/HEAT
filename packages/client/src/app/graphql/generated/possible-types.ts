export interface PossibleTypesResultData {
  possibleTypes: {
    [key: string]: string[]
  }
}
const result: PossibleTypesResultData = {
  "possibleTypes": {
    "BuildFacilityResult": [
      "BuildFacilitySuccess",
      "Conflict",
      "InsufficientResources",
      "MaxLevel",
      "Requires"
    ],
    "DiscardAdventureResult": [
      "AdventureSettled",
      "AdventureVerifiable",
      "Conflict",
      "DiscardAdventureSuccess"
    ],
    "Error": [
      "AdventureDiscarded",
      "AdventureOpen",
      "AdventureSettled",
      "AdventureVerifiable",
      "Conflict",
      "EngineUpdated",
      "HallFull",
      "HallLevel",
      "HeroAdventuring",
      "HeroDead",
      "HeroNotHere",
      "HeroRetired",
      "InsufficientResources",
      "MaxLevel",
      "Requires"
    ],
    "JoinGameResult": [
      "JoinGameSuccess"
    ],
    "RecruitHeroResult": [
      "Conflict",
      "HallFull",
      "HallLevel",
      "InsufficientResources",
      "RecruitHeroSuccess"
    ],
    "RetireHeroResult": [
      "Conflict",
      "HeroAdventuring",
      "RetireHeroSuccess"
    ],
    "StartAdventureResult": [
      "AdventureOpen",
      "Conflict",
      "HeroAdventuring",
      "HeroDead",
      "HeroNotHere",
      "HeroRetired",
      "Requires",
      "StartAdventureSuccess"
    ],
    "SubmitAdventureResult": [
      "AdventureDiscarded",
      "Conflict",
      "EngineUpdated",
      "SubmitAdventureSuccess"
    ]
  }
};
export default result;
