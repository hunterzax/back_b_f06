import {PrismaService} from 'prisma/prisma.service'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * Helper function to find nomination points that need end date updates
 */
export async function findMoveEndDatePoints(
  prisma: PrismaService,
  pointName: string,
  startDate: Date,
  endDate: Date | null,
  refId?: number | null,
  targetTable?: string,
  meteredId?: string | null
) {
  const dateConditionInOR: any[] =
    [
      //Prisma.nomination_pointWhereInput[] = [
      {end_date: null}
    ]

  const andInWhere: any[] = [
    {
      start_date: {
        lte: startDate
      }
    }
  ]

  if (endDate) {
    dateConditionInOR.push({
      AND: [
        {
          end_date: {
            gt: startDate
          }
        },
        {
          end_date: {
            gt: endDate
          }
        }
      ]
    })
  } else {
    dateConditionInOR.push({
      end_date: {
        gt: startDate
      }
    })
  }

  andInWhere.push({
    OR: dateConditionInOR
  })

  switch (targetTable) {
    case 'metering_point':
      const orInAndInWhere: any[] =
        [
          {
            metered_point_name:
              pointName
          }
        ]
      if (refId) {
        orInAndInWhere.push({
          id: refId
        })
      }
      if (meteredId) {
        orInAndInWhere.push({
          metered_id:
            meteredId
        })
      }
      andInWhere.push({
        OR: orInAndInWhere
      })

      return await prisma.metering_point.findMany(
        {
          where: {
            AND: andInWhere
          },
          orderBy: {
            id: 'desc'
          },
          include: {
            customer_type: true
          }
        }
      )
    default:
      if (refId) {
        andInWhere.push({
          OR: [
            {
              nomination_point:
                pointName
            },
            {
              id: refId
            }
          ]
        })
      } else {
        andInWhere.push({
          nomination_point:
            pointName
        })
      }
      return await prisma.nomination_point.findMany(
        {
          where: {
            AND: andInWhere
          },
          orderBy: {
            id: 'desc'
          }
        }
      )
  }
}

/**
 * Helper function to find nomination points that need start date updates
 */
export async function findMoveStartDatePoints(
  prisma: PrismaService,
  pointName: string,
  startDate: Date,
  endDate: Date | null,
  refId?: number | null,
  targetTable?: string,
  meteredId?: string | null
) {
  const andInWhere: any[] = [
    {
      start_date: {
        gte: startDate
      }
    },
    {
      OR: [
        {end_date: null},
        {
          AND: endDate
            ? [
                {
                  end_date: {
                    gt: startDate
                  }
                },
                {
                  end_date: {
                    gt: endDate
                  }
                }
              ]
            : [
                {
                  end_date: {
                    gt: startDate
                  }
                }
              ]
        }
      ]
    }
  ]

  if (endDate) {
    andInWhere.push({
      start_date: {
        lte: endDate
      }
    })
  }

  switch (targetTable) {
    case 'metering_point':
      const orInAndInWhere: any[] =
        [
          {
            metered_point_name:
              pointName
          }
        ]
      if (refId) {
        orInAndInWhere.push({
          id: refId
        })
      }
      if (meteredId) {
        orInAndInWhere.push({
          metered_id:
            meteredId
        })
      }
      andInWhere.push({
        OR: orInAndInWhere
      })

      return await prisma.metering_point.findMany(
        {
          where: {
            AND: andInWhere
          },
          orderBy: {
            id: 'desc'
          }
        }
      )
    default:
      if (refId) {
        andInWhere.push({
          OR: [
            {
              nomination_point:
                pointName
            },
            {
              id: refId
            }
          ]
        })
      } else {
        andInWhere.push({
          nomination_point:
            pointName
        })
      }
      return await prisma.nomination_point.findMany(
        {
          where: {
            AND: andInWhere
          },
          orderBy: {
            id: 'desc'
          }
        }
      )
  }
}

/**
 * Helper function to check if oldPoint should be added to move arrays
 */
export function shouldAddOldPointToEndDateArray(
  oldPoint: any,
  startDate: Date,
  endDate: Date | null
): boolean {
  return (
    oldPoint.start_date <=
      startDate &&
    (oldPoint.end_date ==
      null ||
      (endDate
        ? oldPoint.end_date >
            startDate &&
          oldPoint.end_date >
            endDate
        : oldPoint.end_date >
          startDate))
  )
}

export function shouldAddOldPointToStartDateArray(
  oldPoint: any,
  startDate: Date,
  endDate: Date
): boolean {
  return (
    oldPoint.start_date >=
      startDate &&
    oldPoint.start_date <=
      endDate &&
    (oldPoint.end_date ==
      null ||
      (oldPoint.end_date >
        startDate &&
        oldPoint.end_date >
          endDate))
  )
}

/**
 * Helper function to check if a new period should be BLOCKED (not just overlapping)
 * Returns true only for cases that should prevent the operation entirely
 */
export function shouldBlockNewPeriod(
  newStart: Date,
  newEnd: Date | null,
  existingStart: Date,
  existingEnd: Date | null
): boolean {
  // Case 15: Block when new period conflicts with existing indefinite period
  if (!existingEnd) {
    // Block if new period starts same time as existing indefinite period
    if (
      newStart.getTime() ===
      existingStart.getTime()
    ) {
      // Block if new period overlaps with existing indefinite period
      // (new period ends after existing indefinite period starts)
      if (
        newEnd &&
        newEnd > existingStart
      ) {
        return true
      }
    }
  }

  // Case 16: Both indefinite periods, new starts earlier
  if (
    !existingEnd &&
    !newEnd &&
    newStart < existingStart
  ) {
    return true
  }

  // Case 8: Same periods (duplicate)
  if (
    newStart.getTime() ===
      existingStart.getTime() &&
    ((newEnd &&
      existingEnd &&
      newEnd.getTime() ===
        existingEnd.getTime()) ||
      (!newEnd &&
        !existingEnd))
  ) {
    return true
  }

  // Case 9: New starts same as existing but ends later
  if (
    newStart.getTime() ===
      existingStart.getTime() &&
    newEnd &&
    existingEnd &&
    newEnd > existingEnd
  ) {
    return true
  }

  // Case 10: New starts earlier but ends same as existing
  if (
    newStart <
      existingStart &&
    newEnd &&
    existingEnd &&
    newEnd.getTime() ===
      existingEnd.getTime()
  ) {
    return true
  }

  // Case 11: New starts earlier and ends later (completely contains existing)
  if (
    newStart <
      existingStart &&
    newEnd &&
    existingEnd &&
    newEnd > existingEnd
  ) {
    return true
  }

  // Case 5: New period is completely within existing period
  if (
    newStart >
      existingStart &&
    newEnd &&
    existingEnd &&
    newEnd < existingEnd
  ) {
    return true
  }

  // Additional indefinite period conflicts
  if (
    !newEnd &&
    existingEnd &&
    newStart <= existingStart
  ) {
    return true
  }

  return false
}

/**
 * Helper function to check if two date periods overlap and need adjustment
 * Returns true if periods overlap but can be auto-adjusted (not blocked)
 */
export function isPeriodsOverlapping(
  newStart: Date,
  newEnd: Date | null,
  existingStart: Date,
  existingEnd: Date | null
): boolean {
  // First check if this should be blocked entirely
  if (
    shouldBlockNewPeriod(
      newStart,
      newEnd,
      existingStart,
      existingEnd
    )
  ) {
    return false // Don't treat blocked cases as simple overlaps
  }

  // Case 1: New period starts after existing starts but before existing ends
  // This should trigger auto-adjustment: set existing end_date = new start_date
  if (
    existingEnd &&
    newStart < existingEnd &&
    newStart > existingStart
  ) {
    return true
  }

  // Case 2: New period starts before existing period starts, but ends after existing starts
  // This should trigger auto-adjustment
  if (
    newEnd &&
    newStart <
      existingStart &&
    newEnd > existingStart
  ) {
    return true
  }

  // Case 3: New period completely contains existing period
  // This should trigger auto-adjustment
  if (
    newEnd &&
    existingEnd &&
    newStart <=
      existingStart &&
    newEnd >= existingEnd
  ) {
    return true
  }

  // Case 5: New period has no end date and starts before existing period ends or during it
  // This should trigger auto-adjustment
  if (
    !newEnd &&
    existingEnd &&
    newStart < existingEnd &&
    newStart > existingStart
  ) {
    return true
  }

  return false
}

/**
 * Helper function to get a descriptive reason for the conflict
 */
export function getConflictReason(
  newStart: Date,
  newEnd: Date | null,
  existingStart: Date,
  existingEnd: Date | null
): string {
  const formatDate = (
    date: Date
  ) =>
    dayjs(date).format(
      'DD/MM/YYYY'
    )

  if (!existingEnd) {
    // New period starts on same date or before existing indefinite period
    if (
      newStart <=
      existingStart
    ) {
      return `conflicts with indefinite period starting ${formatDate(existingStart)}`
    }
    // This case should rarely happen since new periods after indefinite periods are allowed
    return `already exists at ${formatDate(existingStart)}`
  }

  if (!newEnd) {
    return `indefinite period conflicts with existing period (${formatDate(existingStart)} - ${formatDate(existingEnd)})`
  }

  if (
    newStart <=
      existingStart &&
    newEnd >= existingEnd
  ) {
    return `completely contains existing period (${formatDate(existingStart)} - ${formatDate(existingEnd)})`
  }

  if (
    newStart >=
      existingStart &&
    newStart < existingEnd
  ) {
    return `starts during existing period (${formatDate(existingStart)} - ${formatDate(existingEnd)})`
  }

  if (
    newEnd > existingStart &&
    newStart < existingStart
  ) {
    return `ends during existing period (${formatDate(existingStart)} - ${formatDate(existingEnd)})`
  }

  return `overlaps with existing period (${formatDate(existingStart)} - ${formatDate(existingEnd)})`
}

export async function arrConfigSet(
  prisma: any,
  id: any
) {
  let areaCode = []
  const configMasterPath =
    await prisma.config_master_path.findMany(
      {
        where: {
          id: {not: id}
        },
        include: {
          revised_capacity_path:
            {
              include: {
                area: true
              }
            },
          revised_capacity_path_edges: true,
          create_by_account: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true
            }
          },
          update_by_account: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true
            }
          }
        }
      }
    )
  configMasterPath.map(
    async (e: any) => {
      let setNodes =
        e?.revised_capacity_path?.map(
          (area: any) =>
            area?.area
        )
      let setEdges =
        e?.revised_capacity_path_edges?.map(
          (area: any) => {
            return {
              source_id:
                area?.source_id,
              target_id:
                area?.target_id
            }
          }
        )
      let filTypeStart =
        setEdges.find(
          (f: any) => {
            return !!f?.target_id
          }
        )
      let filNodesStart =
        setNodes?.find(
          (f: any) => {
            return (
              f?.id ===
              filTypeStart?.source_id
            )
          }
        )

      const startSourceId =
        filNodesStart?.id
      const result: any =
        (await this.getTargetSequence(
          startSourceId,
          setEdges
        )) || []
      let areaArr = []
      areaArr.push(
        filNodesStart
      )
      for (
        let i = 0;
        i < result.length;
        i++
      ) {
        let idNode =
          setNodes.find(
            (f: any) => {
              return (
                f?.id ===
                result[i]
              )
            }
          )
        if (idNode) {
          areaArr.push(idNode)
        }
      }
      let newAreaArr = areaArr
        .map(
          (ar: any) => ar?.id
        )
        .join('')
      areaCode.push(
        newAreaArr
      )
      return e
    }
  )
  return {
    configMasterPath,
    areaCode
  }
}

export async function getTargetSequence(
  startSourceId: any,
  setEdges: any
) {
  const result = []
  let currentSourceId =
    startSourceId

  while (true) {
    const found =
      setEdges.find(
        (item) =>
          item.source_id ===
          currentSourceId
      )
    if (!found) break
    result.push(
      found.target_id
    )
    currentSourceId =
      found.target_id
  }

  return result
}

export async function dfConfigSet(
  nodes: any,
  edges: any
) {
  let starts = edges.find(
    (f: any) => {
      return !!f?.target_id
    }
  )
  let nodesStart =
    nodes?.find((f: any) => {
      return (
        f?.id ===
        starts?.source_id
      )
    })

  const startSourceIdDf =
    nodesStart?.id
  const resultDf: any =
    (await getTargetSequence(
      startSourceIdDf,
      edges
    )) || []
  let areaArrCreate = []
  for (
    let i = 0;
    i < resultDf.length;
    i++
  ) {
    let idNode = nodes.find(
      (f: any) => {
        return (
          f?.id ===
          resultDf[i]
        )
      }
    )
    if (idNode) {
      areaArrCreate.push(
        idNode
      )
    }
  }
  let newAreaArr =
    startSourceIdDf +
    areaArrCreate
      .map(
        (ar: any) => ar?.id
      )
      .join('')
  return newAreaArr
}
