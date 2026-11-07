import java.util.HashMap;
import java.util.Map;

public class lk01 {
    public static void main(String[] args) {
        int[] nums = {2, 7, 11, 15};
        int target = 9;

        Map<Integer, Integer> map = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            Integer j = map.get(target - nums[i]);   // 找搭档
            if (j != null) {
                System.out.println("[" + j + ", " + i + "]");
                return;
            }
            map.put(nums[i], i);                     // 记录当前数的位置
        }
    }
}
