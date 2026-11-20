import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class lk08 {
    public static void main(String[] args) {
        // 测试样例，你可以改这里的数组
        int[] nums = {-1,0,1,2,-1,-4};
        List<List<Integer>> res = threeSum(nums);
        System.out.println(res);
    }

    public static List<List<Integer>> threeSum(int[] nums) {
        List<List<Integer>> result = new ArrayList<>();
        Arrays.sort(nums); // 先排序，是双指针和去重的基础
        int n = nums.length;

        // 固定第一个数 nums[i]
        for (int i = 0; i < n - 2; i++) {
            // 去重：和上一个一样就跳过，避免重复三元组
            if (i > 0 && nums[i] == nums[i - 1]) {
                continue;
            }
            int left = i + 1;
            int right = n - 1;

            while (left < right) {
                int sum = nums[i] + nums[left] + nums[right];
                if (sum == 0) {
                    // 找到一组答案
                    result.add(Arrays.asList(nums[i], nums[left], nums[right]));
                    // 左指针去重
                    while (left < right && nums[left] == nums[left + 1]) {
                        left++;
                    }
                    // 右指针去重
                    while (left < right && nums[right] == nums[right - 1]) {
                        right--;
                    }
                    // 一起移动
                    left++;
                    right--;
                } else if (sum < 0) {
                    // 和太小，左边往右变大
                    left++;
                } else {
                    // 和太大，右边往左变小
                    right--;
                }
            }
        }
        return result;
    }
}
