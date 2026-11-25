import java.util.HashMap;

public class lk11 {
    public static int subarraySum(int[] nums, int k) {
        int count = 0, sum = 0;
        HashMap<Integer, Integer> map = new HashMap<>();
        map.put(0, 1); // 前缀和为0出现1次
        for (int num : nums) {
            sum += num;
            count += map.getOrDefault(sum - k, 0); // 有多少个前缀和等于 sum-k，就有多少个子数组
            map.put(sum, map.getOrDefault(sum, 0) + 1);
        }
        return count;
    }

    public static void main(String[] args) {
        System.out.println(subarraySum(new int[]{1, 1, 1}, 2)); // 2
        System.out.println(subarraySum(new int[]{1, 2, 3}, 3)); // 2
    }
}
