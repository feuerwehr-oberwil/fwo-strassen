from shapely.geometry import LineString, Point

from build import house_number, number_ranges, numbering_ends, section_count, section_geometries


def test_house_number_parses_suffixes():
    assert [house_number(x) for x in ["12a", "31.1", "7", ""]] == [12, 31, 7, None]


def test_number_ranges_are_contiguous_and_round():
    nums = list(range(1, 201))
    ranges = number_ranges(nums, 4)
    assert ranges == [(1, 49), (50, 99), (100, 149), (150, 200)]


def test_number_ranges_drop_empty_gaps():
    # numbers jump from 19 to 80, so no range may cover only the empty gap
    nums = [*range(1, 20), *range(80, 120)]
    ranges = number_ranges(nums, 4)
    assert all(any(lo <= n <= hi for n in nums) for lo, hi in ranges)
    assert ranges[0][0] == 1 and ranges[-1][1] == 119


def test_section_count_needs_enough_addresses():
    assert section_count(2000, 10) == 0
    assert section_count(600, 20) == 2
    assert section_count(2900, 237) == 5


def test_sections_follow_address_order_and_touch():
    line = LineString([(0, 0), (1000, 0)])
    low = [Point(x, 10) for x in range(50, 450, 50)]
    high = [Point(x, -10) for x in range(550, 950, 50)]
    a, b = section_geometries(line, [low, high])
    assert a.bounds[0] < b.bounds[0]
    assert abs(a.bounds[2] - b.bounds[0]) < 1  # neighbours meet halfway


def test_numbering_ends_follow_the_numbers():
    line = LineString([(0, 0), (300, 0)])
    pts = [Point(x, 5) for x in (20, 90, 160, 230, 290)]
    low, high = numbering_ends(line, pts, [9, 7, 5, 3, 1])  # numbers grow towards x = 0
    assert (low.x, high.x) == (300, 0)


def test_numbering_ends_skip_unclear_streets():
    line = LineString([(0, 0), (300, 0)])
    pts = [Point(x, 5) for x in (20, 90, 160, 230, 290)]
    assert numbering_ends(line, pts, [1, 9, 3, 7, 5]) is None  # jumbled
    assert numbering_ends(line, pts[:3], [1, 2, 3]) is None  # too few houses
