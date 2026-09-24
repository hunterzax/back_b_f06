import {
  Inject,
  Injectable
} from '@nestjs/common'
import {ClientGrpc} from '@nestjs/microservices'
import {PrismaService} from 'prisma/prisma.service'
import {
  Observable,
  firstValueFrom
} from 'rxjs'
import {
  getActiveNominationFiles,
  applyNominationValues,
  findMissingGasData,
  findMissingGasDataFromValueOnly,
  applyNominationValuesToValueOnlyObject
} from 'src/common/utils/meter.util'
import {
  getTodayNowYYYYMMDDDfaultAdd7,
  getWeekRange
} from 'src/common/utils/date.util'

interface MeteredService {
  SendMessage(data: {
    message: any
  }): Observable<{
    reply: string
  }>
}

@Injectable()
export class MeteredMicroService {
  private meteredService: MeteredService

  constructor(
    @Inject('METERED_SERVICE')
    private client: ClientGrpc
  ) {}

  onModuleInit() {
    this.meteredService =
      this.client.getService<MeteredService>(
        'MeteredService'
      )
  }

  async sendMessage(
    payload: any,
    paramsForReplaceMissingMeterWithNomination?: {
      activeData: any[]
      prisma: PrismaService
    }
  ) {
    try {
      // return null
      const response =
        await firstValueFrom(
          this.meteredService.SendMessage(
            {
              message: payload
              // message: Uint8Array.from(payload),
            }
          )
        )

      if (
        paramsForReplaceMissingMeterWithNomination
      ) {
        return this.replaceMissingMeterWithNomination(
          payload,
          paramsForReplaceMissingMeterWithNomination,
          response
        )
      } else {
        return response
      }
    } catch (error) {
      return {
        reply: null
      }
    }
  }

  async replaceMissingMeterWithNomination(
    payload: any,
    paramsForReplaceMissingMeterWithNomination?: {
      activeData: any[]
      prisma: PrismaService
    },
    response?: {reply: string}
  ) {
    try {
      if (
        paramsForReplaceMissingMeterWithNomination
      ) {
        const requestBody =
          JSON.parse(payload)
        switch (
          requestBody?.case
        ) {
          case 'get-last-have-value':
            if (
              response?.reply
            ) {
              const data =
                JSON.parse(
                  response?.reply
                )
              if (
                data &&
                Array.isArray(
                  data
                ) &&
                data.length >
                  0
              ) {
                // Extract unique gas days from the data
                const gasDays =
                  this.extractGasDaysFromData(
                    data
                  )
                const missingGasDataAnalysis =
                  await Promise.all(
                    gasDays.map(
                      async (
                        gasDay
                      ) => {
                        const activeDataForDate =
                          paramsForReplaceMissingMeterWithNomination.activeData.find(
                            (
                              item
                            ) =>
                              item.date ==
                              gasDay
                          )
                        if (
                          activeDataForDate?.activeMeteringPoints
                        ) {
                          // Find active metering points that don't have volume, heatingValue, wobbeIndex and energy data for this gas day
                          const missingGasPoints =
                            findMissingGasDataFromValueOnly(
                              activeDataForDate.activeMeteringPoints,
                              data,
                              gasDay
                            )
                          if (
                            missingGasPoints.length >
                            0
                          ) {
                            const targetDayjs =
                              getTodayNowYYYYMMDDDfaultAdd7(
                                gasDay +
                                  'T00:00:00Z'
                              )
                            const targetDate =
                              targetDayjs.toDate()
                            const {
                              weekStart:
                                targetWeekStart,
                              weekEnd:
                                targetWeekEnd
                            } =
                              getWeekRange(
                                targetDate
                              )
                            // Use DRY utility to fetch nomination files
                            const activeNominationFiles =
                              await getActiveNominationFiles(
                                {
                                  targetDate,
                                  targetWeekStart,
                                  targetWeekEnd,
                                  prisma:
                                    paramsForReplaceMissingMeterWithNomination.prisma
                                }
                              )
                            if (
                              activeNominationFiles.length >
                              0
                            ) {
                              const dailyNomination =
                                activeNominationFiles.filter(
                                  (
                                    item
                                  ) =>
                                    item
                                      .nomination_type
                                      ?.id ===
                                    1
                                )
                              const weeklyNomination =
                                activeNominationFiles.filter(
                                  (
                                    item
                                  ) =>
                                    item
                                      .nomination_type
                                      ?.id ===
                                    2
                                )
                              // DRY: Apply daily nomination values
                              const uniqueReplacedGasPoints =
                                applyNominationValuesToValueOnlyObject(
                                  {
                                    nominationFiles:
                                      dailyNomination,
                                    missingGasPoints,
                                    data,
                                    gasDay,
                                    isWeekly: false
                                  }
                                )
                              // For weekly, need to build headData and gasDayKey for each file
                              for (const item of weeklyNomination) {
                                const version =
                                  item
                                    .nomination_version?.[0]
                                const fullJson =
                                  version
                                    ?.nomination_full_json?.[0]
                                    ?.data_temp
                                if (
                                  !fullJson
                                )
                                  continue
                                const nominationFullJson =
                                  JSON.parse(
                                    fullJson
                                  )
                                if (
                                  nominationFullJson?.headData &&
                                  Array.isArray(
                                    nominationFullJson?.headData
                                  ) &&
                                  nominationFullJson
                                    ?.headData
                                    .length >
                                    0 &&
                                  nominationFullJson?.valueData &&
                                  Array.isArray(
                                    nominationFullJson?.valueData
                                  ) &&
                                  nominationFullJson
                                    ?.valueData
                                    .length >
                                    0
                                ) {
                                  const headData =
                                    nominationFullJson.headData
                                  const valueToKeyMap =
                                    Object.fromEntries(
                                      Object.entries(
                                        headData
                                      ).map(
                                        ([
                                          k,
                                          v
                                        ]) => [
                                          v,
                                          k
                                        ]
                                      )
                                    )
                                  const gasDayKey =
                                    valueToKeyMap[
                                      targetDayjs.format(
                                        'DD/MM/YYYY'
                                      )
                                    ]
                                  if (
                                    gasDayKey
                                  ) {
                                    applyNominationValues(
                                      {
                                        nominationFiles:
                                          [
                                            item
                                          ],
                                        missingGasPoints,
                                        data,
                                        gasDay,
                                        isWeekly: true,
                                        uniqueReplacedGasPoints,
                                        headData,
                                        gasDayKey
                                      }
                                    )
                                  }
                                }
                              }
                            }
                          }
                          return {
                            gasDay,
                            totalActivePoints:
                              activeDataForDate
                                .activeMeteringPoints
                                .length,
                            missingVolumeCount:
                              missingGasPoints.length,
                            missingVolumePoints:
                              missingGasPoints
                          }
                        }
                        return null
                      }
                    )
                  )
              }
            }
            return response
          case 'getLast':
          case 'get-last-once':
            if (
              response?.reply
            ) {
              const data =
                JSON.parse(
                  response?.reply
                )
              if (
                data &&
                Array.isArray(
                  data
                ) &&
                data.length >
                  0
              ) {
                // Extract unique gas days from the data
                const gasDays =
                  this.extractGasDaysFromData(
                    data
                  )
                const missingGasDataAnalysis =
                  await Promise.all(
                    gasDays.map(
                      async (
                        gasDay
                      ) => {
                        const activeDataForDate =
                          paramsForReplaceMissingMeterWithNomination.activeData.find(
                            (
                              item
                            ) =>
                              item.date ==
                              gasDay
                          )
                        if (
                          activeDataForDate?.activeMeteringPoints
                        ) {
                          // Find active metering points that don't have volume, heatingValue, wobbeIndex and energy data for this gas day
                          const missingGasPoints =
                            findMissingGasData(
                              activeDataForDate.activeMeteringPoints,
                              data,
                              gasDay
                            )

                          if (
                            missingGasPoints.length >
                            0
                          ) {
                            const targetDayjs =
                              getTodayNowYYYYMMDDDfaultAdd7(
                                gasDay +
                                  'T00:00:00Z'
                              )
                            const targetDate =
                              targetDayjs.toDate()
                            const {
                              weekStart:
                                targetWeekStart,
                              weekEnd:
                                targetWeekEnd
                            } =
                              getWeekRange(
                                targetDate
                              )
                            // Use DRY utility to fetch nomination files
                            const activeNominationFiles =
                              await getActiveNominationFiles(
                                {
                                  targetDate,
                                  targetWeekStart,
                                  targetWeekEnd,
                                  prisma:
                                    paramsForReplaceMissingMeterWithNomination.prisma
                                }
                              )
                            if (
                              activeNominationFiles.length >
                              0
                            ) {
                              const dailyNomination =
                                activeNominationFiles.filter(
                                  (
                                    item
                                  ) =>
                                    item
                                      .nomination_type
                                      ?.id ===
                                    1
                                )
                              const weeklyNomination =
                                activeNominationFiles.filter(
                                  (
                                    item
                                  ) =>
                                    item
                                      .nomination_type
                                      ?.id ===
                                    2
                                )
                              // DRY: Apply daily nomination values
                              const uniqueReplacedGasPoints =
                                applyNominationValues(
                                  {
                                    nominationFiles:
                                      dailyNomination,
                                    missingGasPoints,
                                    data,
                                    gasDay,
                                    isWeekly: false
                                  }
                                )
                              // For weekly, need to build headData and gasDayKey for each file
                              for (const item of weeklyNomination) {
                                const version =
                                  item
                                    .nomination_version?.[0]
                                const fullJson =
                                  version
                                    ?.nomination_full_json?.[0]
                                    ?.data_temp
                                if (
                                  !fullJson
                                )
                                  continue
                                const nominationFullJson =
                                  JSON.parse(
                                    fullJson
                                  )
                                if (
                                  nominationFullJson?.headData &&
                                  Array.isArray(
                                    nominationFullJson?.headData
                                  ) &&
                                  nominationFullJson
                                    ?.headData
                                    .length >
                                    0 &&
                                  nominationFullJson?.valueData &&
                                  Array.isArray(
                                    nominationFullJson?.valueData
                                  ) &&
                                  nominationFullJson
                                    ?.valueData
                                    .length >
                                    0
                                ) {
                                  const headData =
                                    nominationFullJson.headData
                                  const valueToKeyMap =
                                    Object.fromEntries(
                                      Object.entries(
                                        headData
                                      ).map(
                                        ([
                                          k,
                                          v
                                        ]) => [
                                          v,
                                          k
                                        ]
                                      )
                                    )
                                  const gasDayKey =
                                    valueToKeyMap[
                                      targetDayjs.format(
                                        'DD/MM/YYYY'
                                      )
                                    ]
                                  if (
                                    gasDayKey
                                  ) {
                                    applyNominationValues(
                                      {
                                        nominationFiles:
                                          [
                                            item
                                          ],
                                        missingGasPoints,
                                        data,
                                        gasDay,
                                        isWeekly: true,
                                        uniqueReplacedGasPoints,
                                        headData,
                                        gasDayKey
                                      }
                                    )
                                  }
                                }
                              }
                            }
                          }
                          return {
                            gasDay,
                            totalActivePoints:
                              activeDataForDate
                                .activeMeteringPoints
                                .length,
                            missingVolumeCount:
                              missingGasPoints.length,
                            missingVolumePoints:
                              missingGasPoints
                          }
                        }
                        return null
                      }
                    )
                  )
              }
              response.reply =
                JSON.stringify(
                  data
                )
            }
            return response
          default:
            return response
        }
      } else {
        return response
      }
    } catch (error) {
      return response
    }
  }

  /**
   * Extract unique gas days from metering data
   */
  private extractGasDaysFromData(
    data: any[]
  ): string[] {
    if (
      !Array.isArray(data)
    ) {
      return []
    }

    const gasDays =
      new Set<string>()

    data.map((item) => {
      if (item.gasDay) {
        gasDays.add(
          item.gasDay
        )
      }
    })

    return Array.from(
      gasDays
    ).sort(
      (a, b) =>
        new Date(
          b
        ).getTime() -
        new Date(a).getTime()
    )
  }
}
