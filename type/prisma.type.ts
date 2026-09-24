import { contract_code, Prisma, zone, group } from "@prisma/client";

export const areaPopulate = {
  include: {
    zone: {
      select: {
        id: true,
        name: true,
        color: true,
        zone_master_quality: true
      },
    },
  }
}
export const areaPopulateForCal = {
  include: {
    zone: {
      select: {
        id: true,
        name: true,
      },
    },
    entry_exit: {
      select: {
        id: true,
        name: true,
      },
    },
    supply_reference_quality_area_by: {
      select: {
        id: true,
        name: true,
        start_date: true,
        end_date: true,
      },
    },
    owner_area: {
      include: {
        east_area: {
          select: {
            id: true,
            name: true,
            start_date: true,
            end_date: true,
          }
        },
        west_area: {
          select: {
            id: true,
            name: true,
            start_date: true,
            end_date: true,
          }
        }
      }
    },
  }
}
export const queryShipperNominationFilePopulate = {
  include: {
    nomination_type: true,
    contract_code: {
      select: {
        id: true,
        contract_code: true,
      },
    },
    reserve_balancing_gas_contract: {
      select: {
        id: true,
        res_bal_gas_contract: true,
      },
    },
    query_shipper_nomination_status: {
      select: {
        name: true,
      },
    },
  }
}
export const queryShipperNominationFilePopulateForCal = {
  include: {
    group: true,
    query_shipper_nomination_status: true,
    contract_code: true,
    reserve_balancing_gas_contract: true,
    nomination_type: true,
    nomination_version: {
      include: {
        nomination_full_json: true,
        nomination_full_json_sheet2: true,
        nomination_row_json: {
          include: { query_shipper_nomination_type: true },
          orderBy: { id: Prisma.SortOrder.asc },
        },
      },
      where: { flag_use: true },
    }
  }
}
export const nominationPointPopulate = {
  include: {
    area: {
      select: {
        name: true,
      },
    },
    zone: {
      select: {
        name: true,
      },
    },
    contract_point_list: {
      select: {
        contract_point: true,
      },
    },
    entry_exit: true,
    metering_point: true
  }
}
export const conceptPointPopulate = {
  include: {
    type_concept_point: true,
  }
}
export const nonTpaPointPopulate = {
  include: {
    area: {
      select: {
        name: true,
      },
    },
    nomination_point: {
      include: {
        area: {
          select: {
            name: true,
          },
        },
        zone: {
          select: {
            name: true,
          },
        },
      },
    },
    metering_point: true
  }
}
export const meteringPointPopulate = {
  include: {
    customer_type: true,
    area: {
      select: {
        id: true,
        name: true,
      },
    },
    zone: {
      select: {
        id: true,
        name: true,
      },
    },
    nomination_point: {
      include: {
        zone: {
          select: {
            id: true,
            name: true,
          },
        },
        entry_exit: {
          select: {
            id: true,
            name: true,
          },
        },
        area: {
          select: {
            id: true,
            name: true,
          },
        },
        contract_point_list: {
          include: {
            area: true,
            zone: true,
            shipper_contract_point: {
              include: {
                group: true,
                // group: {
                //   select: {
                //     id: true,
                //     name: true,
                //     id_name: true,
                //     company_name: true,
                //     start_date: true,
                //     end_date: true
                //   }
                // },
              }
            },
          }
        },
        customer_type: true,
      },
    },
    non_tpa_point: {
      include: {
        nomination_point: {
          include: {
            contract_point_list: {
              include: {
                area: true,
                zone: true,
                shipper_contract_point: {
                  include: {
                    group: true,
                  }
                },
              }
            },
            customer_type: true,
          }
        }
      }
    }
  }
}
export const allocationModePopulate = {
  select: {
    start_date: true,
    create_date: true,
    allocation_mode_type: {
      select: {
        mode: true,
      },
    },
  }
}
export type areaWithRelations = Prisma.areaGetPayload<typeof areaPopulate>
export type areaWithRelationsForCal = Prisma.areaGetPayload<typeof areaPopulateForCal>
export type queryShipperNominationFileWithRelations = Prisma.query_shipper_nomination_fileGetPayload<typeof queryShipperNominationFilePopulate>
export type queryShipperNominationFileWithRelationsForCal = Prisma.query_shipper_nomination_fileGetPayload<typeof queryShipperNominationFilePopulateForCal>
export type nominationPointWithRelations = Prisma.nomination_pointGetPayload<typeof nominationPointPopulate>
export type conceptPointWithRelations = Prisma.concept_pointGetPayload<typeof conceptPointPopulate>
export type nonTpaPointWithRelations = Prisma.non_tpa_pointGetPayload<typeof nonTpaPointPopulate>
export type meteringPointWithRelations = Prisma.metering_pointGetPayload<typeof meteringPointPopulate>
export type allocationModeRecord = Prisma.allocation_modeGetPayload<typeof allocationModePopulate>
export type activeData = {
  date: string
  activeAreas?: areaWithRelations[]
  activeZones?: zone[]
  activeGroups?: group[]
  activeNominationFiles?: queryShipperNominationFileWithRelations[]
  activeContractCodes?: contract_code[]
  activeNominationPoints?: nominationPointWithRelations[]
  activeConceptPoints?: conceptPointWithRelations[]
  activeNonTpaPoints?: nonTpaPointWithRelations[]
  activeMeteringPoints?: meteringPointWithRelations[]
}